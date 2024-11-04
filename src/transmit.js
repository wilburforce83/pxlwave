const { ipcMain } = require('electron');

console.log('transmit.js loaded');

// Constants for tone frequency and timing
const MIN_TONE_FREQ = 1000; // Hz
const MAX_TONE_FREQ = 1100; // Hz
const BANDWIDTH = MAX_TONE_FREQ - MIN_TONE_FREQ; // 100Hz bandwidth
const TONE_DURATION = 50; // 50 milliseconds per tone
const CALIBRATION_TONE_MIN = 950; // Hz, slightly below the min tone for calibration
const CALIBRATION_TONE_MAX = 1150; // Hz, slightly above the max tone for calibration

let txAudioContext = null;
let oscillator = null;
let gainNode = null;

// Header size in bits (64 bits)
const HEADER_SIZE = 64;

// Function to encode the transmission header
function encodeHeader(senderCallsign, recipientCallsign, mode) {
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
    console.log(`Transmitting tone at ${frequency} Hz`);
    oscillator = txAudioContext.createOscillator();
    gainNode = txAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, txAudioContext.currentTime); // Set frequency

    oscillator.connect(gainNode);
    gainNode.connect(txAudioContext.destination);
    
    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
    }, duration);
}

// Function to convert image data into tones
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
async function startTransmission(gridData, senderCallsign, recipientCallsign, mode, event) {
    console.log('Creating audio context for transmission');
    // Create audio context
    txAudioContext = new (AudioContext || webkitAudioContext)();

    const headerBinary = encodeHeader(senderCallsign, recipientCallsign, mode);
    console.log(`Header: ${headerBinary}`);

    // Transmit calibration tones
    await transmitCalibrationTone(CALIBRATION_TONE_MIN, 500); // Transmit min calibration tone (500ms)
    await transmitCalibrationTone(CALIBRATION_TONE_MAX, 500); // Transmit max calibration tone (500ms)

    // Encode image data into tones
    const tones = encodeImageToTones(gridData, palette);

    // Transmit each tone
    for (const tone of tones) {
        await transmitTone(tone, TONE_DURATION);
    }

    // Log transmission completion
    event.sender.send('log-tx', `Transmission complete. Sent ${tones.length} tones.`);
}

// Function to transmit calibration tones
async function transmitCalibrationTone(frequency, duration) {
    console.log(`Transmitting calibration tone: ${frequency} Hz`);
    await transmitTone(frequency, duration);
}

// Function to wait until the 7th second of the next UTC minute
async function waitForUTCStart() {
    const now = new Date();
    
    let msToNextMinute = (60 - now.getUTCSeconds()) * 1000 - now.getUTCMilliseconds();
    console.log(`Waiting for transmission window:`, msToNextMinute);
    
    if (msToNextMinute < 0) {
        msToNextMinute = 0; // Prevent negative values due to timing differences
    }

    const msToStart = msToNextMinute + 7000; // Calculate delay to the 7th second of the next minute
   
    return new Promise(resolve => setTimeout(resolve, msToStart));
}

module.exports = {
    waitForUTCStart,
    startTransmission,
};
