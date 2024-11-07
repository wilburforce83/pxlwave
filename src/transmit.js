console.log('transmit.js loaded');

// Constants for tone frequency and timing
const MIN_TONE_FREQ = 1000; // Hz
const MAX_TONE_FREQ = 1100; // Hz
const BANDWIDTH = MAX_TONE_FREQ - MIN_TONE_FREQ; // 100Hz bandwidth
const TONE_DURATION = 150; // 50 milliseconds per tone
const CALIBRATION_TONE_MIN = 950; // Hz, calibration tone start
const CALIBRATION_TONE_MAX = 1150; // Hz, calibration tone end
const HEADER_TONE_DURATION = 150; // 100 milliseconds for header tones

// Frequency map for encoding header (A-Z, 0-9, and '-')
const CHAR_FREQ_MAP = {
    'A': 1000, 'B': 1005, 'C': 1010, 'D': 1015, 'E': 1020, 'F': 1025, 'G': 1030, 'H': 1035,
    'I': 1040, 'J': 1045, 'K': 1050, 'L': 1055, 'M': 1060, 'N': 1065, 'O': 1070, 'P': 1075,
    'Q': 1080, 'R': 1085, 'S': 1090, 'T': 1095, 'U': 1100, 'V': 1105, 'W': 1110, 'X': 1115,
    'Y': 1120, 'Z': 1125, '0': 1130, '1': 1135, '2': 1140, '3': 1145, '4': 1150, '5': 1155,
    '6': 1160, '7': 1165, '8': 1170, '9': 1175, '-': 1180, ' ': 1185
};

let txAudioContext = null;
let oscillator = null;
let gainNode = null;
let countdownInterval = null;

// Function to initialize and start the continuous audio stream
function initOscillator() {
    txAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = txAudioContext.createOscillator();
    gainNode = txAudioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(CALIBRATION_TONE_MIN, txAudioContext.currentTime); // Initial frequency
    oscillator.connect(gainNode);
    gainNode.connect(txAudioContext.destination);
    gainNode.gain.setValueAtTime(1, txAudioContext.currentTime); // Set volume

    oscillator.start(); // Start the continuous oscillator
}

// Function to change the oscillator frequency for the specified tone duration
async function changeTone(frequency, duration) {
    console.log(`Changing tone to ${frequency} Hz for ${duration}ms`);
    oscillator.frequency.setValueAtTime(frequency, txAudioContext.currentTime); // Change frequency
    await new Promise(resolve => setTimeout(resolve, duration)); // Wait for duration
}

// Function to toggle the TX tag
function toggleTxTag(active) {
    txTag.classList.toggle('tag-inactive', !active);
    txTag.classList.toggle('tag-tx', active);
}

// Function to encode and transmit header data (callsigns and mode)
async function transmitHeader(senderCallsign, recipientCallsign, mode) {
    const headerString = `${senderCallsign}-${recipientCallsign}-${mode}`.padEnd(15, ' ');
    console.log(`Encoding and transmitting header: ${headerString}`);

    for (const char of headerString) {
        const frequency = CHAR_FREQ_MAP[char];
        if (frequency) {
            await changeTone(frequency, HEADER_TONE_DURATION);
        } else {
            console.error(`No frequency mapping for character: ${char}`);
        }
    }

    // End header with an additional calibration tone
    await changeTone(CALIBRATION_TONE_MAX, 500);
    console.log('Header and calibration tone transmitted.');
}

// Main transmission function for image data
async function startTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    toggleTxTag(true);
    console.log('Starting continuous audio stream for transmission');
    initOscillator(); // Initialize the continuous audio stream

    console.log(`Transmitting header: ${senderCallsign} ${recipientCallsign} ${mode}`);

    // Transmit calibration tones before the header
    await changeTone(CALIBRATION_TONE_MIN, 500);
    await changeTone(CALIBRATION_TONE_MAX, 500);

    // Transmit encoded header data
    await transmitHeader(senderCallsign, recipientCallsign, mode);

    // Map each color in gridData to a tone and transmit
    let modeVal = 32;
    if (mode === "4T") {
        modeVal = 4;
    }
    const tones = gridData.map(colorIndex => MIN_TONE_FREQ + (colorIndex * (BANDWIDTH / modeVal)));
    console.log(`Transmitting ${tones.length} tones for image data`);

    for (const [index, tone] of tones.entries()) {
        // console.log(`Transmitting tone ${index + 1} of ${tones.length}`);
        await changeTone(tone, TONE_DURATION); // Change tone without stopping oscillator
    }

    toggleTxTag(false);
    console.log('Transmission complete.');
    oscillator.stop(); // Stop the oscillator after transmission is complete
}

// Countdown logic to schedule transmission on every 3rd minute +7 seconds from a fixed epoch
function scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    const transmitButton = document.getElementById('transmit-button');
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z'); // Fixed epoch start

    // Calculate the time since the epoch in milliseconds
    const timeSinceEpoch = now.getTime() - epoch.getTime();

    // Calculate how many milliseconds are in a 3-minute interval
    const intervalMs = 3 * 60 * 1000;

    // Calculate the next 3-minute interval after the epoch
    const nextInterval = new Date(epoch.getTime() + Math.ceil(timeSinceEpoch / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(7); // Set seconds to +7 as required
    nextInterval.setUTCMilliseconds(0);

    // Calculate the remaining time until the next interval
    const timeUntilTransmit = nextInterval.getTime() - now.getTime();
    let countdown = Math.ceil(timeUntilTransmit / 1000);

    // Update button text with countdown
    const countdownInterval = setInterval(() => {
        transmitButton.textContent = `Transmit (${countdown}s)`;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            transmitButton.textContent = 'Transmit';
            startTransmission(gridData, senderCallsign, recipientCallsign, mode);
        }
        countdown--;
    }, 1000);

    addToLog(`Transmission scheduled for ${recipientCallsign}. Waiting for synchronized 3rd minute interval...`, "tx", senderCallsign);
}


// Export the startTransmission and scheduleTransmission functions
module.exports = {
    startTransmission,
    scheduleTransmission,
};
