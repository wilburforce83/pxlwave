console.log('transmit.js loaded');
let toneLog = []; // Object to store tone log data
let txAudioContext = null;
let oscillator = null;
let gainNode = null;
let countdownInterval = null;
let TX_Active = false;

// Function to change the oscillator frequency for each tone duration, with optional smooth transition
async function changeTone(frequency, duration) {
    const timestamp = performance.now(); // Record timestamp of tone change
    toneLog.push({ timestamp, frequency });

    if (USE_SMOOTH_TRANSITIONS) {
        oscillator.frequency.linearRampToValueAtTime(frequency, txAudioContext.currentTime + 0.02);
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
    gainNode.gain.linearRampToValueAtTime(1, txAudioContext.currentTime + (TONE_DURATION * 0.15) / 1000); // 5ms fade-in

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
            
            if (i !== 0) {
                // Insert calibration tone between characters
                await changeTone(CALIBRATION_TONE_MIN, TONE_DURATION);
            }
        
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
    await new Promise(resolve => setTimeout(resolve, 10)); // 10ms gap after header
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
    await new Promise(resolve => setTimeout(resolve, 10)); // Gap after calibration

    // Transmit encoded header data
    await transmitHeader(senderCallsign, recipientCallsign, mode);

    // Select the tone map based on the mode
    const toneMap = mode === "4T" ? _4T_TONE_MAP : _32C_TONE_MAP;

    // Map each color in gridData to a tone from the selected tone map
    const tones = gridData.map(colorIndex => toneMap[colorIndex]);

    // Transmit tones for image data with calibration tones between characters
    for (let i = 0; i < tones.length; i++) {
        // Before each character, insert calibration tone
        await changeTone(CALIBRATION_TONE_MIN, TONE_DURATION);
        if (i % 32 === 0 && i !== 0) {
            // After every 32nd character (end of line), use END_OF_LINE tone
            await changeTone(END_OF_LINE, TONE_DURATION*2);
        }
        // Transmit character tone from the selected tone map
        await changeTone(tones[i], TONE_DURATION);
    }

    toggleTxTag(false);
    TX_Active = false;
    console.log('Transmission complete.');
    oscillator.stop(); // Stop oscillator after transmission

    // Log tone transmission data
    console.log("Tone Transmission Log:", toneLog);
}

// Countdown logic to schedule transmission on every x minute +7 seconds from a fixed epoch
function scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    const transmitButton = document.getElementById('transmit-button');
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z'); // Fixed epoch start

    // Calculate the time since the epoch in milliseconds
    const timeSinceEpoch = now.getTime() - epoch.getTime();

    // Calculate how many milliseconds are in a 3-minute interval
    const intervalMs = PROCESSING_INTERVAL * 60 * 1000;

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
