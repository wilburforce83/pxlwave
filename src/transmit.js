// Define the tone frequency range for 100Hz bandwidth
const MIN_TONE_FREQ = 1000; // Hz
const MAX_TONE_FREQ = 1100; // Hz
const BANDWIDTH = MAX_TONE_FREQ - MIN_TONE_FREQ; // 100Hz bandwidth
const TONE_DURATION = 50; // Reduced tone duration (50 milliseconds per tone)
const CALIBRATION_TONE_MIN = 950; // Hz, slightly below the min tone for calibration
const CALIBRATION_TONE_MAX = 1150; // Hz, slightly above the max tone for calibration

let txAudioContext = null;
let oscillator = null;

// Header size (adjusted for smaller transmission time)
const HEADER_SIZE = 64; // Reduced to 64 bits for faster transmission

// Function to encode the transmission header
function encodeHeader(senderCallsign, recipientCallsign, mode) {
    const header = {
        senderCallsign,
        recipientCallsign,
        mode, // 'color' or '4-gray'
        calibrationToneMin: CALIBRATION_TONE_MIN,
        calibrationToneMax: CALIBRATION_TONE_MAX
    };
    
    // Convert the header into a binary string representation
    const headerBinary = callsignToBinary(senderCallsign) + callsignToBinary(recipientCallsign) + modeToBinary(mode);
    return headerBinary.padEnd(HEADER_SIZE, '0'); // Pad to 64 bits
}

// Function to convert callsign to binary
function callsignToBinary(callsign) {
    return callsign.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
}

// Function to convert mode ('color' or '4-gray') to binary
function modeToBinary(mode) {
    return mode === 'color' ? '01' : '10'; // Use 01 for color and 10 for grayscale mode
}

// Function to generate tones for the transmission
async function transmitTone(frequency, duration) {
    oscillator = txAudioContext.createOscillator();
    const gainNode = txAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, txAudioContext.currentTime); // Set frequency
    
    oscillator.connect(gainNode);
    gainNode.connect(txAudioContext.destination);
    
    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
    }, duration);
}

// Function to convert image data into tones (adjusted for 100Hz bandwidth)
function encodeImageToTones(gridData, palette) {
    const tones = [];
    const toneStep = BANDWIDTH / palette.length; // Calculate step size within the 100Hz bandwidth

    gridData.forEach(colorIndex => {
        const toneFreq = MIN_TONE_FREQ + (colorIndex * toneStep); // Map color to a tone within the bandwidth
        tones.push(toneFreq);
    });

    return tones;
}

// Main transmission function
async function startTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    // Create audio context
    txAudioContext = new (window.txAudioContext || window.webkittxAudioContext)();

    const headerBinary = encodeHeader(senderCallsign, recipientCallsign, mode);
    console.log(`Header: ${headerBinary}`);

    // Generate tones for the header
    await transmitCalibrationTone(CALIBRATION_TONE_MIN, 500); // Transmit min calibration tone (500ms)
    await transmitCalibrationTone(CALIBRATION_TONE_MAX, 500); // Transmit max calibration tone (500ms)

    // Encode image data into tones
    const tones = encodeImageToTones(gridData, palette);

    // Transmit each tone
    for (const tone of tones) {
        await transmitTone(tone, TONE_DURATION);
    }

    // Log transmission completion
    ipcRenderer.send('log-tx', `Transmission complete. Sent ${tones.length} tones.`);
}

// Function to transmit calibration tones
async function transmitCalibrationTone(frequency, duration) {
    console.log(`Transmitting calibration tone: ${frequency} Hz`);
    await transmitTone(frequency, duration);
}

// Function to wait until the 7th second of the next UTC minute
function waitForUTCStart() {
    const now = new Date();
    ipcRenderer.send('log-tx', `Waiting to send...`);
    const msToNextMinute = (60 - now.getUTCSeconds()) * 1000;
    const msToStart = msToNextMinute + (7000 - now.getUTCMilliseconds()); // Calculate delay to 7th second
    return new Promise(resolve => setTimeout(resolve, msToStart));
}

// Function to trigger transmission
ipcRenderer.on('start-transmission', async (event, gridData, senderCallsign, recipientCallsign, mode) => {
    await waitForUTCStart(); // Wait until the 7th second of the next minute
    console.log('Starting transmission at UTC 7th second.');
    ipcRenderer.send('log-tx', `Sending...`);
    await startTransmission(gridData, senderCallsign, recipientCallsign, mode);
});
