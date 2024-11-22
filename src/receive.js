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
RX_worker.onmessage = (event) => {
    const { detectedFrequency, startTime, duration } = event.data;
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
        if (RX_microphoneStream) {
            RX_microphoneStream.mediaStream.getTracks().forEach((track) => track.stop());
        }
        if (RX_audioContext) {
            RX_audioContext.close();
        }

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

        addToLog('Microphone stream initialized.');
        RX_startListening();
    } catch (error) {
        console.error('Error initializing microphone stream:', error);
        addToLog('Failed to initialize microphone stream.');
    }
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
