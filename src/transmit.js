// transmit.js

console.log('transmit.js loaded');

let txWorker = new Worker('../src/TX_worker.js');
let txAudioContext = null;
let gainNode = null;
let TX_startTime;
let TX_stopTime;
let TX_Active = false;
let selectedOutputDeviceId = null;
let scheduledAudioBuffer = null;

// Initialize the worker with constants and toneMaps
// transmit.js

// After initializing the worker
txWorker.postMessage({
    action: 'initialize',
    data: {
        TONE_DURATION,
        HEADER_TONE_DURATION,
        GAP_DURATION,
        FEC,
        CALIBRATION_TONE_MIN,
        CALIBRATION_TONE_MAX,
        CALIBRATION_TONE_DURATION, // Add this line
        toneMaps, // Pass the entire toneMaps object
    }
});


// Worker message listener
txWorker.onmessage = function (e) {
    const { action, nextInterval, toneSequence, transmissionData } = e.data;

    switch (action) {
        case 'nextIntervalCalculated':
            if (nextInterval && transmissionData) {
                console.log(`[${new Date().toISOString()}] Next interval calculated: ${nextInterval}`);
                generateToneSequence(transmissionData); // Generate tone sequence immediately after scheduling
                scheduleTransmissionAfterInterval(nextInterval, transmissionData);
            } else {
                console.error('Missing data for scheduling transmission:', nextInterval, transmissionData);
            }
            break;
        case 'toneSequenceGenerated':
            if (toneSequence && transmissionData) {
                console.log(`[${new Date().toISOString()}] Tone sequence generated, starting to compile audio buffer.`);
                precompileAudioBuffer(toneSequence);
            } else {
                console.error('Missing data for tone sequence generation:', toneSequence, transmissionData);
            }
            break;
        default:
            console.error('Unknown action:', action);
    }
};

// Function to generate tone sequence
function generateToneSequence(transmissionData) {
    txWorker.postMessage({
        action: 'generateToneSequence',
        transmissionData: transmissionData
    });
}

// Function to initiate the scheduling of a transmission
async function scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    console.log(`[${new Date().toISOString()}] Transmission clicked`);

    // Initialize the audio context
    await initAudioContext();

    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z');
    const intervalMs = PROCESSING_INTERVAL * 60 * 1000;

    const transmissionData = { gridData, senderCallsign, recipientCallsign, mode };

    // Send message to worker to calculate next interval, with transmissionData included
    txWorker.postMessage({
        action: 'calculateNextInterval',
        data: {
            now: now.toISOString(),
            epoch: epoch.toISOString(),
            intervalMs: intervalMs
        },
        transmissionData: transmissionData
    });
}

// Function to initialize the audio context
async function initAudioContext() {
    if (!txAudioContext) {
        txAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = txAudioContext.createGain();
        gainNode.gain.value = 0.8; // Set the gain as needed
        gainNode.connect(txAudioContext.destination);
        console.log('Audio context initialized.');
    }
}

// Function to schedule the transmission after the calculated interval
function scheduleTransmissionAfterInterval(nextInterval, transmissionData) {
    const now = new Date();
    const timeUntilTransmit = nextInterval.getTime() - now.getTime();

    console.log(`[${new Date().toISOString()}] Transmission scheduled. Time until transmit: ${timeUntilTransmit} ms`);

    setTimeout(() => {
        startTransmission();
    }, timeUntilTransmit);
}

// Function to start the transmission
function startTransmission() {
    console.log(`[${new Date().toISOString()}] Transmission started.`);
    TX_Active = true;
   
    playScheduledAudioBuffer();
}

// Function to play the precompiled audio buffer
function playScheduledAudioBuffer() {
    if (!scheduledAudioBuffer) {
        console.error('No audio buffer scheduled for playback.');
        return;
    }

    const source = txAudioContext.createBufferSource();
    source.buffer = scheduledAudioBuffer;
    source.connect(gainNode);
    TX_startTime = new Date();
    source.start();

    source.onended = () => {
        TX_stopTime = new Date();
        TX_Active = false;
        const actualTransmissionTime = TX_stopTime - TX_startTime; // Calculate actual transmission time in milliseconds
        console.log(`[${new Date().toISOString()}] Transmission ended.`);
        console.log(`Actual Total Transmission Time: ${actualTransmissionTime} ms`);
    };
}

// Function to precompile the audio buffer from the tone sequence
function precompileAudioBuffer(toneSequence) {
    if (!txAudioContext) {
        console.error('Audio context is not available for precompiling the audio buffer.');
        return;
    }

    const sampleRate = txAudioContext.sampleRate;
    let totalDurationSeconds = 0;

    // Calculate the total duration of the buffer
    toneSequence.forEach((tone) => {
        totalDurationSeconds += tone.duration / 1000; // Convert duration to seconds
    });

    const bufferLength = Math.floor(sampleRate * totalDurationSeconds);

    if (bufferLength <= 0) {
        console.error('Calculated bufferLength is zero or negative. Cannot create audio buffer.');
        return;
    }

    const buffer = txAudioContext.createBuffer(1, bufferLength, sampleRate);
    const data = buffer.getChannelData(0);
    let bufferIndex = 0;

    console.log('Transmission Data:');

    toneSequence.forEach((tone, index) => {
        const frequency = tone.frequency;
        const duration = tone.duration;
        const toneDurationSeconds = duration / 1000;
        const toneLengthInSamples = Math.floor(sampleRate * toneDurationSeconds);

        // Envelope duration as a percentage of the tone duration
        const envelopeDuration = toneDurationSeconds * (GAP_DURATION / 100);
        const envelopeSamples = Math.max(1, Math.floor(sampleRate * envelopeDuration));

        console.log(`Tone ${index + 1}: Frequency = ${frequency} Hz, Duration = ${duration} ms`);

        for (let i = 0; i < toneLengthInSamples; i++) {
            // Calculate amplitude with envelope
            let amplitude = 1;
            if (i < envelopeSamples) {
                // Fade-in
                amplitude = i / envelopeSamples;
            } else if (i > toneLengthInSamples - envelopeSamples) {
                // Fade-out
                amplitude = (toneLengthInSamples - i) / envelopeSamples;
            }

            // Generate the sample
            data[bufferIndex++] = amplitude * Math.sin(2 * Math.PI * frequency * (i / sampleRate));
        }
    });

    scheduledAudioBuffer = buffer;

    // Calculate and log the estimated total transmission time
    const estimatedTransmissionTime = totalDurationSeconds * 1000; // Convert to milliseconds
    console.log(`Estimated Total Transmission Time: ${estimatedTransmissionTime} ms`);
    console.log(`[${new Date().toISOString()}] Audio buffer precompiled and ready.`);
}

// Event listener for Transmit button
document.getElementById('transmit-button').addEventListener('click', () => {
    // Replace these with actual values or obtain them from your UI
    const gridData = generateSampleGridData(); // Function to generate or retrieve your 32x32 grid data
    const senderCallsign = 'SENDER';
    const recipientCallsign = 'RECIPIENT';
    const mode = 'DEFAULT';

    scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode);
});