// receive.js - Refactored

let RX_state = {
    headerReceived: false,
    imageStarted: false,
    currentPixel: 0,
    gridData: new Array(1024).fill(0),
    headerData: {},
    errorCount: 0,
    rawReceivedFrequencies: [], // Raw frequency collection
    groupedFrequencies: [], // Grouped frequencies after majority voting
    toneLog: [],
    calibration: {
        minTone: null,
        maxTone: null,
        offset: 0,
    },
};

let RX_audioContext, RX_analyser, RX_microphoneStream, RX_dataArray, RX_worker;
let RX_isListening = false;
let RX_listeningTimeout = null;

// Constants
const RX_EXPECTED_FREQUENCIES = [
    CALIBRATION_TONE_MIN,
    CALIBRATION_TONE_MAX,
    ...Object.values(CHAR_FREQ_MAP),
    ..._32C_TONE_MAP,
];

// Initialize Web Worker
RX_worker = new Worker('../src/RX_worker.js');
// receive.js

RX_worker.onmessage = (event) => {
    const { detectedFrequency, startTime, duration, maxMagnitude, frequencyMagnitudes } = event.data;
    
    // Log the magnitudes for each frequency
    console.log('Frequency magnitudes:', frequencyMagnitudes);
    
    // Log the detected frequency and its magnitude
    console.log(`Detected Frequency: ${detectedFrequency}, Magnitude: ${maxMagnitude}`);

    if (detectedFrequency) {
        RX_state.rawReceivedFrequencies.push({ startTime, duration, frequency: detectedFrequency });
    }
};


function startRXCountdown(timeUntilNextListen) {
    const countdownTag = document.getElementById('countdowntag');
    countdownTag.style.display = 'inline-block';

    let countdown = Math.ceil(timeUntilNextListen / 1000);
    countdownTag.textContent = `Next RX in ${countdown}s`;

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownTag.textContent = `Next RX in ${countdown}s`;
        } else {
            countdownTag.style.display = 'none';
            clearInterval(countdownInterval);
        }
    }, 1000);
}

// Start microphone stream
async function RX_startMicrophoneStream(deviceId = null) {
    try {
        // Wait for the UI to load available devices if "Loading devices..." is still selected
        const recordingSelect = document.getElementById('recording-device');
        while (recordingSelect && recordingSelect.value === "Loading devices...") {
            console.log("Waiting for devices to load...");
            await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms before checking again
        }

        // Automatically use the selected device if no deviceId is provided
        if (!deviceId && recordingSelect) {
            deviceId = recordingSelect.value; // Get the selected device ID
        }

        // Stop any existing microphone stream
        if (RX_microphoneStream) {
            RX_microphoneStream.mediaStream.getTracks().forEach((track) => track.stop());
        }
        if (RX_audioContext) {
            RX_audioContext.close();
        }

        // Initialize the audio context and analyser
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const constraints = deviceId
            ? { audio: { deviceId: { exact: deviceId } } }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);

        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = FFT_SIZE;
        RX_dataArray = new Float32Array(RX_analyser.frequencyBinCount);

        RX_microphoneStream.connect(RX_analyser);

        // Start real-time amplitude monitoring
        monitorAmplitude();

        addToLog(`Microphone stream initialized using device: ${deviceId || 'default'}`);
        RX_startListening();
    } catch (error) {
        console.error('Error initializing microphone stream:', error);
        addToLog('Failed to initialize microphone stream.');
    }
}

// Function to monitor and display amplitude in dB
function monitorAmplitude() {
    const amplitudeOverlay = document.getElementById('amplitude-overlay');
    if (!amplitudeOverlay) {
        console.error("Amplitude overlay element not found.");
        return;
    }

    setInterval(() => {
        RX_analyser.getFloatTimeDomainData(RX_dataArray);
        const sum = RX_dataArray.reduce((a, b) => a + b, 0);
        const average = sum / RX_dataArray.length;
        const amplitudeDb = 20 * Math.log10(Math.abs(average) || 1e-10); // Avoid log of 0

        amplitudeOverlay.textContent = `${amplitudeDb.toFixed(1)} dB`;
    }, 250); // Update every 250ms (adjust as needed)
}





// Start RX process
function RX_startListening() {
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z');
    const intervalMs = PROCESSING_INTERVAL * 60 * 1000;
    const nextInterval = new Date(epoch.getTime() + Math.ceil((now - epoch) / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(RX_startTime);

    const timeUntilNextListen = nextInterval - now;

    startRXCountdown(timeUntilNextListen);

    setTimeout(() => {
        if (!TX_Active) {
            resetRXState();
            toggleRxTag(true);
            RX_isListening = true;
            addToLog('Listening for tones...');
            processMicrophoneInput();

            RX_listeningTimeout = setTimeout(() => {
                if (!RX_state.headerReceived) {
                    RX_stopListening();
                    RX_startListening();
                }
            }, 5000); // Timeout for RX listening
        }
    }, timeUntilNextListen);
}

function RX_stopListening() {
    RX_isListening = false;
    toggleRxTag(false);
    if (RX_audioContext) RX_audioContext.suspend();
    clearTimeout(RX_listeningTimeout);
    addToLog('Stopped listening.');
}

// Process microphone input
function processMicrophoneInput() {
    if (!RX_isListening) return;

    RX_analyser.getFloatTimeDomainData(RX_dataArray);
    const windowedSamples = applyHammingWindow(Array.from(RX_dataArray));

    RX_worker.postMessage({
        samples: windowedSamples,
        sampleRate: RX_audioContext.sampleRate,
        expectedFrequencies: RX_EXPECTED_FREQUENCIES,
        calibrationOffset: RX_state.calibration.offset,
    });

    setTimeout(processMicrophoneInput, PROCESSING_INTERVAL);
}

// Utility functions
function applyHammingWindow(samples) {
    const N = samples.length;
    return samples.map((sample, n) => sample * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1))));
}

function resetRXState() {
    RX_state = {
        headerReceived: false,
        imageStarted: false,
        currentPixel: 0,
        gridData: new Array(1024).fill(0),
        headerData: {},
        errorCount: 0,
        rawReceivedFrequencies: [],
        groupedFrequencies: [],
        toneLog: [],
        calibration: { minTone: null, maxTone: null, offset: 0 },
    };
}

function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

(async () => {
    await RX_startMicrophoneStream();
})();




