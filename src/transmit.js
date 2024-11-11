console.log('transmit.js loaded');

// Constants for tone frequency and timing
const MIN_TONE_FREQ = 975; // Hz
const MAX_TONE_FREQ = 1125; // Hz
const BANDWIDTH = MAX_TONE_FREQ - MIN_TONE_FREQ; // 150Hz bandwidth
const TONE_DURATION = 60; // 60 milliseconds per tone
const CALIBRATION_TONE_MIN = 950; // Hz, calibration tone start
const CALIBRATION_TONE_MAX = 1150; // Hz, calibration tone end
const HEADER_TONE_DURATION = 150; // 100 milliseconds for header tones
// Toggle smooth transitions on or off
const USE_SMOOTH_TRANSITIONS = true; // Set to false to disable smooth transitions

// Object to store tone log data
let toneLog = [];

// Frequency map for encoding header (A-Z, 0-9, and '-')
const CHAR_FREQ_MAP = {
    'A': 975, 'B': 979, 'C': 983, 'D': 987, 'E': 991, 'F': 995, 'G': 999, 'H': 1003, 
    'I': 1007, 'J': 1011, 'K': 1015, 'L': 1019, 'M': 1023, 'N': 1027, 'O': 1031, 'P': 1035, 
    'Q': 1039, 'R': 1043, 'S': 1047, 'T': 1051, 'U': 1055, 'V': 1059, 'W': 1063, 'X': 1067, 
    'Y': 1071, 'Z': 1075, '0': 1079, '1': 1083, '2': 1087, '3': 1091, '4': 1095, '5': 1099, 
    '6': 1103, '7': 1107, '8': 1111, '9': 1115, '-': 1119, ' ': 1125
};

// Define constants for tone mapping
const TX_32C_TONE_MAP = [
    975, 979, 983, 987, 991, 995, 999, 1003,
    1007, 1011, 1015, 1019, 1023, 1027, 1031, 1035,
    1039, 1043, 1047, 1051, 1055, 1059, 1063, 1067,
    1071, 1075, 1079, 1083, 1087, 1091, 1095, 1099
];
const TX_4T_TONE_MAP = [975, 1023, 1075, 1099];


let txAudioContext = null;
let oscillator = null;
let gainNode = null;
let countdownInterval = null;

// Function to change the oscillator frequency for each tone duration, with optional smooth transition
async function changeTone(frequency, duration) {
    const timestamp = performance.now(); // Record timestamp of tone change
    toneLog.push({ timestamp, frequency });

    if (USE_SMOOTH_TRANSITIONS) {
        oscillator.frequency.linearRampToValueAtTime(frequency, txAudioContext.currentTime + 0.01);
    } else {
        oscillator.frequency.setValueAtTime(frequency, txAudioContext.currentTime);
    }

    gainNode.gain.setValueAtTime(1, txAudioContext.currentTime); // Keep gain at full volume
    await new Promise(resolve => setTimeout(resolve, duration)); // Wait for tone duration
}

// Function to initialize and start the continuous audio stream with initial gain adjustments
function initOscillator() {
    txAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = txAudioContext.createOscillator();
    gainNode = txAudioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(CALIBRATION_TONE_MIN, txAudioContext.currentTime); // Initial frequency
    oscillator.connect(gainNode);
    gainNode.connect(txAudioContext.destination);

    // Set initial gain to 0 to prevent any clicks on start
    gainNode.gain.setValueAtTime(0, txAudioContext.currentTime);

    // Gradually ramp up gain at the start to avoid clicks
    gainNode.gain.linearRampToValueAtTime(1, txAudioContext.currentTime + 0.005); // 5ms fade-in

    oscillator.start(); // Start the continuous oscillator
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
    
    const headerTones = []; // Array to store header tones for logging

    for (let i = 0; i < headerString.length; i++) {
        const char = headerString[i];
        const frequency = CHAR_FREQ_MAP[char];
        if (frequency) {
            /*
            if (i !== 0) {
                // Insert calibration tone between characters
                await changeTone(CALIBRATION_TONE_MIN, 60);
            }
            */
            headerTones.push(frequency); // Store each tone in the array
            await changeTone(frequency, HEADER_TONE_DURATION);
        } else {
            console.error(`No frequency mapping for character: ${char}`);
        }
    }

    // Log header tones for debugging
    console.log('Transmitted header tones:', headerTones);

    // End header with a calibration tone and a gap for separation
    await changeTone(CALIBRATION_TONE_MAX, 500);
    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms gap after header
    console.log('Header and calibration tone transmitted.');
}

// Main transmission function with tone logging
async function startTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    toggleTxTag(true);
    console.log('Starting continuous audio stream for transmission');
    initOscillator(); // Initialize the continuous audio stream

    toneLog = []; // Reset tone log at start

    console.log(`Transmitting header: ${senderCallsign} ${recipientCallsign} ${mode}`);

    // Transmit calibration tones before the header
    await changeTone(CALIBRATION_TONE_MIN, 500);
    await changeTone(CALIBRATION_TONE_MAX, 500);
    await new Promise(resolve => setTimeout(resolve, 200)); // Gap after calibration

    // Transmit encoded header data
    await transmitHeader(senderCallsign, recipientCallsign, mode);

    // Select the tone map based on the mode
    const toneMap = mode === "4T" ? TX_4T_TONE_MAP : TX_32C_TONE_MAP;

    // Map each color in gridData to a tone from the selected tone map
    const tones = gridData.map(colorIndex => toneMap[colorIndex]);

    // Transmit tones for image data with calibration tones between characters
    for (let i = 0; i < tones.length; i++) {
        // Before each character, insert calibration tone
        if (i % 32 === 0 && i !== 0) {
            // After every 32nd character (end of line), use MAX calibration tone
            await changeTone(CALIBRATION_TONE_MAX, 60);
        }
        // Transmit character tone from the selected tone map
        await changeTone(tones[i], TONE_DURATION);
    }

    toggleTxTag(false);
    console.log('Transmission complete.');
    oscillator.stop(); // Stop oscillator after transmission

    // Log tone transmission data
    console.log("Tone Transmission Log:", toneLog);
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
