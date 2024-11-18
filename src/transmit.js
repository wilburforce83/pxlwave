console.log('transmit.js loaded');
let txWorker = new Worker('../src/TX_worker.js');
let txAudioContext = null;
let gainNode = null;
let TX_startTime;
let TX_stopTime;
let TX_Active = false;
let selectedOutputDeviceId = null;
let scheduledAudioBuffer = null;

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
        data: {
            gridData: transmissionData.gridData,
            toneMap: _32C_TONE_MAP
        },
        transmissionData: transmissionData
    });
}

// Function to initialize audio context
async function initAudioContext() {
    if (!txAudioContext) {
        txAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (selectedOutputDeviceId) {
        const audioDestination = await createAudioDestination(selectedOutputDeviceId);
        gainNode = txAudioContext.createGain();
        gainNode.connect(audioDestination);
    } else {
        gainNode = txAudioContext.createGain();
        gainNode.connect(txAudioContext.destination);
    }
    console.log(`[${new Date().toISOString()}] Audio context initialized.`);
}

// Function to create an audio destination for a specific output device
async function createAudioDestination(deviceId) {
    try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined } });
        const audioDestination = txAudioContext.createMediaStreamDestination();
        const source = txAudioContext.createMediaStreamSource(audioStream);
        source.connect(audioDestination);
        return audioDestination;
    } catch (error) {
        console.error('Error creating audio destination:', error);
        throw error;
    }
}

// Function to precompile the audio buffer
function precompileAudioBuffer(toneSequence) {
    if (!txAudioContext) {
        console.error('Audio context is not available for precompiling the audio buffer.');
        return;
    }

    const bufferLength = txAudioContext.sampleRate * (toneSequence.length * TONE_DURATION / 1000);
    const buffer = txAudioContext.createBuffer(1, bufferLength, txAudioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let bufferIndex = 0;

    toneSequence.forEach((frequency) => {
        const toneLengthInSamples = txAudioContext.sampleRate * (TONE_DURATION / 1000);
        for (let i = 0; i < toneLengthInSamples; i++) {
            data[bufferIndex++] = Math.sin(2 * Math.PI * frequency * (i / txAudioContext.sampleRate));
        }
    });

    scheduledAudioBuffer = buffer;
    console.log(`[${new Date().toISOString()}] Audio buffer precompiled and ready.`);
}

// Function to schedule playback of the precompiled audio buffer
function schedulePlaybackAudioBuffer() {
    if (!txAudioContext || !scheduledAudioBuffer) {
        console.error('Audio context or scheduled audio buffer is not available.');
        return;
    }

    const source = txAudioContext.createBufferSource();
    source.buffer = scheduledAudioBuffer;
    source.connect(gainNode);
    source.start();
    source.onended = () => {
        TX_stopTime = new Date();
        TX_Active = false;
        const actualTransmissionTime = TX_stopTime - TX_startTime;
        console.log(`[${TX_stopTime.toISOString()}] Transmission complete.`);
        console.log(`Actual Transmission Time: ${actualTransmissionTime} ms`);
    };
    TX_startTime = new Date();
    console.log(`[${new Date().toISOString()}] Playback of audio buffer started.`);
}

// Function to schedule transmission at the next available interval
function scheduleTransmissionAfterInterval(nextInterval, transmissionData) {
    const transmitButton = document.getElementById('transmit-button');
    const timeUntilTransmit = nextInterval.getTime() - new Date().getTime();
    let countdown = Math.ceil(timeUntilTransmit / 1000);

    console.log(`[${new Date().toISOString()}] Transmission scheduled. Time until transmit: ${timeUntilTransmit} ms`);

    const countdownInterval = setInterval(() => {
        transmitButton.textContent = `Transmit (${countdown}s)`;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            transmitButton.textContent = 'Transmit';
            TX_Active = true;

            // Play the precompiled audio buffer immediately
            schedulePlaybackAudioBuffer();
        }
        countdown--;
    }, 1000);
}

// Playback device selection listener
document.getElementById('playback-device').addEventListener('change', async (event) => {
    selectedOutputDeviceId = event.target.value;
    console.log('Playback device changed:', selectedOutputDeviceId);

    if (txAudioContext) {
        // Close the current audio context and reinitialize with the new device
        try {
            await txAudioContext.close();
            txAudioContext = null;
            console.log('Reinitializing audio context with new playback device');
        } catch (error) {
            console.error('Error closing previous audio context:', error);
        }
    }
});

// Function to initiate the scheduling of a transmission
function scheduleTransmission(gridData, senderCallsign, recipientCallsign, mode) {
    console.log(`[${new Date().toISOString()}] Transmission clicked`);
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z');
    const intervalMs = PROCESSING_INTERVAL * 60 * 1000;

    const transmissionData = { gridData, senderCallsign, recipientCallsign, mode };

    // Send message to worker to calculate next interval, with transmissionData included
    txWorker.postMessage({
        action: 'calculateNextInterval',
        data: { now, epoch, intervalMs },
        transmissionData: transmissionData
    });
}
