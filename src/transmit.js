console.log('transmit.js loaded');

// Constants for tone frequency and timing
const MIN_TONE_FREQ = 1000; // Hz
const MAX_TONE_FREQ = 1100; // Hz
const BANDWIDTH = MAX_TONE_FREQ - MIN_TONE_FREQ; // 100Hz bandwidth
const TONE_DURATION = 50; // 50 milliseconds per tone
const CALIBRATION_TONE_MIN = 950; // Hz, slightly below the min tone for calibration
const CALIBRATION_TONE_MAX = 1150; // Hz, slightly above the max tone for calibration
const HEADER_TONE_DURATION = 100; // 100 milliseconds for header tones

// Frequency map for encoding header (A-Z, 0-9, and '-')
const CHAR_FREQ_MAP = {
    'A': 1000, 'B': 1005, 'C': 1010, 'D': 1015, 'E': 1020, 'F': 1025, 'G': 1030, 'H': 1035,
    'I': 1040, 'J': 1045, 'K': 1050, 'L': 1055, 'M': 1060, 'N': 1065, 'O': 1070, 'P': 1075,
    'Q': 1080, 'R': 1085, 'S': 1090, 'T': 1095, 'U': 1100, 'V': 1105, 'W': 1110, 'X': 1115,
    'Y': 1120, 'Z': 1125, '0': 1130, '1': 1135, '2': 1140, '3': 1145, '4': 1150, '5': 1155,
    '6': 1160, '7': 1165, '8': 1170, '9': 1175, '-': 1180
};

let txAudioContext = null;
let oscillator = null;
let gainNode = null;
let countdownInterval = null;

// Function to generate tones for the transmission
async function transmitTone(frequency, duration) {
    toggleTxTag(true);
    console.log(`Transmitting tone at ${frequency} Hz`);

    oscillator = txAudioContext.createOscillator();
    gainNode = txAudioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, txAudioContext.currentTime); // Set frequency
    oscillator.connect(gainNode);
    gainNode.connect(txAudioContext.destination);

    oscillator.start();

    // Use oscillator.stop to ensure it stops after the specified duration
    await new Promise(resolve => setTimeout(() => {
        oscillator.stop();
        resolve(); // Continue after stopping the oscillator
    }, duration));
}

// Function to toggle the TX tag
function toggleTxTag(active) {
    txTag.classList.toggle('tag-inactive', !active);
    txTag.classList.toggle('tag-tx', active);
}

// Function to encode header data (senderCallsign, recipientCallsign, mode)
async function transmitHeader(senderCallsign, recipientCallsign, mode) {
    const headerString = `${senderCallsign}-${recipientCallsign}-${mode}`;
    console.log(`Encoding and transmitting header: ${headerString}`);

    // Convert each character in the header to its corresponding frequency
    for (const char of headerString) {
        const frequency = CHAR_FREQ_MAP[char];
        if (frequency) {
            await transmitTone(frequency, HEADER_TONE_DURATION);
        } else {
            console.error(`No frequency mapping for character: ${char}`);
        }
    }

    // Transmit an additional calibration tone after the header
    await transmitTone(CALIBRATION_TONE_MAX, 500);
    console.log('Header and calibration tone transmitted.');
}

// Main transmission function
async function startTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    console.log('Creating audio context for transmission');
    txAudioContext = new (window.AudioContext || window.webkitAudioContext)();

    console.log(`Header: ${senderCallsign} ${recipientCallsign} ${mode}`);

    // Transmit calibration tones before the header
    await transmitTone(CALIBRATION_TONE_MIN, 500);
    await transmitTone(CALIBRATION_TONE_MAX, 500);

    // Transmit encoded header data
    await transmitHeader(senderCallsign, recipientCallsign, mode);

    // Assuming a 32-color palette, map each color in gridData to a tone
    const tones = gridData.map(colorIndex => MIN_TONE_FREQ + (colorIndex * (BANDWIDTH / 32))); 

    console.log(`Transmitting ${tones.length} tones for image data`);

    // Transmit each tone
    for (const [index, tone] of tones.entries()) {
        console.log(`Transmitting tone ${index + 1} of ${tones.length}`);
        await transmitTone(tone, TONE_DURATION); // Transmit each tone for 50 milliseconds
    }

    toggleTxTag(false);
    console.log('Transmission complete.');
}

// Countdown logic that calculates the time remaining until the next +7 seconds
function scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    const transmitButton = document.getElementById('transmit-button');
    const now = new Date();
    const nextMinute = new Date(now.getTime() + (60000 - now.getSeconds() * 1000)); // Start of the next minute
    nextMinute.setSeconds(7); // Schedule at +7 seconds

    const timeUntilTransmit = nextMinute.getTime() - now.getTime(); // Milliseconds until +7 seconds
    let countdown = Math.ceil(timeUntilTransmit / 1000);

    // Update button text with countdown
    countdownInterval = setInterval(() => {
        transmitButton.textContent = `Transmit (${countdown}s)`;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            transmitButton.textContent = 'Transmit';
            startTransmission(gridData, senderCallsign, recipientCallsign, mode);
        }
        countdown--;
    }, 1000);

    addToLog(`Transmission booked to ${recipientCallsign}, waiting for next minute...`, "tx", senderCallsign);
}

// Export the startTransmission and scheduleTransmission functions
module.exports = {
    startTransmission,
    scheduleTransmission,
};
