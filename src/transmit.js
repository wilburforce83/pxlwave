// transmit.js

console.log('transmit.js loaded');
let toneLog = []; // Object to store tone log data
let txAudioContext = null;
let oscillator = null;
let gainNode = null;
let countdownInterval = null;
let TX_Active = false;
let TX_startTime;
let TX_stopTime;

// Web Worker for handling heavy transmission calculations
const txWorker = new Worker('../src/TX_worker.js');

// Function to handle messages from the worker
txWorker.onmessage = function(e) {
    const { action, data } = e.data;
    switch(action) {
        case 'toneSequenceGenerated':
            startTransmittingToneSequence(data.toneSequence);
            break;
        case 'nextIntervalCalculated':
            scheduleTransmissionAfterInterval(data.nextInterval);
            break;
        default:
            console.error('Unknown action:', action);
    }
};

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
    gainNode.gain.linearRampToValueAtTime(1, txAudioContext.currentTime + (TONE_DURATION * 0.075) / 1000); // 7.5% fade-in

    oscillator.start(); // Start the continuous oscillator
    TX_startTime = new Date();
    console.log("TX_Start", TX_startTime);
}

// Function to toggle the TX tag
function toggleTxTag(active) {
    txTag.classList.toggle('tag-inactive', !active);
    txTag.classList.toggle('tag-tx', active);
}

// Function to start transmitting the generated tone sequence
async function startTransmittingToneSequence(toneSequence) {
    toggleTxTag(true);
    console.log('Starting continuous audio stream for transmission');
    initOscillator(); // Initialize the continuous audio stream

    toneLog = []; // Reset tone log at start

    // Transmit calibration tones before the header
    await changeTone(CALIBRATION_TONE_MAX, 500);
    await new Promise(resolve => setTimeout(resolve, 10)); // Gap after calibration

    // Transmit tones for image data
    for (let i = 0; i < toneSequence.length; i++) {
        // Transmit character tone from the selected tone map
        await changeTone(toneSequence[i], TONE_DURATION);
    }

    TX_stopTime = new Date();
    toggleTxTag(false);
    TX_Active = false;
    console.log('Transmission complete.', TX_stopTime);
    let TX_time = TX_stopTime - TX_startTime;
    console.log(`TX: ${TX_time} ms`);
    oscillator.stop(); // Stop oscillator after transmission

    // Log tone transmission data
    console.log("Tone Transmission Log:", toneLog);
}

// Main transmission function with tone logging
async function startTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    console.log(`Transmitting header: ${senderCallsign} ${recipientCallsign} ${mode}`);

    // Use the worker to generate tone sequence
    txWorker.postMessage({ action: 'generateToneSequence', data: { gridData, toneMap: _32C_TONE_MAP } });
}

// Countdown logic to schedule transmission on every x minute +7 seconds from a fixed epoch
function scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    const transmitButton = document.getElementById('transmit-button');
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z'); // Fixed epoch start

    // Calculate how many milliseconds are in a 3-minute interval
    const intervalMs = PROCESSING_INTERVAL * 60 * 1000;

    // Use the worker to calculate the next transmission interval
    txWorker.postMessage({ action: 'calculateNextInterval', data: { now, epoch, intervalMs } });

    let countdown = Math.ceil(intervalMs / 1000);
    countdownInterval = setInterval(() => {
        transmitButton.textContent = `Transmit (${countdown}s)`;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            transmitButton.textContent = 'Transmit';
            TX_Active = true;
            startTransmission(gridData, senderCallsign, recipientCallsign, mode);
        }
        countdown--;
    }, 1000);

    addToLog(`Transmission scheduled for ${recipientCallsign}. Waiting for synchronized ${PROCESSING_INTERVAL} minute interval...`, "tx", senderCallsign);
}

// Export the startTransmission and scheduleTransmission functions
module.exports = {
    startTransmission,
    scheduleTransmission,
};
