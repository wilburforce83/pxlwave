// receive.js - Refactored

let RX_state = {
    startTime: 0,
    headerReceived: false,
    imageStarted: false,
    currentPixel: 0,
    gridData: new Array(1024).fill(0),
    headerData: {},
    errorCount: 0,
    rawReceivedFrequencies: [], // Raw frequency collection
    groupedHeaderFrequencies: [], // Grouped frequencies after majority voting
    groupedImageFrequencies: [],
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

    const RXtime = startTime - RX_state.startTime;
   // console.log(RXtime)
    // Log the magnitudes for each frequency
  //  console.log('Start time', startTime);

    // Log the detected frequency and its magnitude
   //  console.log(`Detected Frequency: ${detectedFrequency}, Magnitude: ${maxMagnitude}`);

    if (detectedFrequency) {
        RX_state.rawReceivedFrequencies.push({ startTime, duration, frequency: detectedFrequency });
    }
    if (RXtime > 10000 && !RX_state.headerReceived) {
        RX_state.headerReceived = true;
        const HeaderFrequencies = headerFECArr();
        console.log(HeaderFrequencies);
        if (!HeaderFrequencies) {
            RX_state.headerReceived = false;
            console.error("Failed to process header frequencies.");
            return;
        }
        
        const headerTones = majorityVote(HeaderFrequencies);
        console.log("Decoded Header Tones:", headerTones);
        console.log(decodeHeaderAndUpdateUI(headerTones));
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
            RX_state.startTime = performance.now();
            processMicrophoneInput();

            RX_listeningTimeout = setTimeout(() => {
                if (!RX_state.headerReceived) {
                    RX_stopListening();
                    RX_startListening();
                }
            }, 15000); // Timeout for RX listening
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





/* ********************************************
                                              *
                                              *
// Utility functions                          *
                                              *
***********************************************/






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



function headerFECArr() {
    const repetitions = 3; // 3 repetitions of the header tones
    const tonesPerHeader = 17; // Number of tones in the header
    const datumFrequency = CALIBRATION_TONE_MAX; // Calibration frequency to find datum timestamp
    const maxDatumTime = RX_state.startTime+20000; // Maximum time for the datum start

    // Find the datum startTime (last occurrence of 1800 Hz within the maxDatumTime window)
    const datumElement = RX_state.rawReceivedFrequencies
        .filter(({ frequency, startTime }) => frequency === datumFrequency && startTime < maxDatumTime)
        .pop();

    if (!datumElement) {
        console.error("No datum frequency (1800 Hz) found within the specified time window.");
        return null;
    }

    const datumStartTime = datumElement.startTime + datumElement.duration; // Datum start

    // Initialize groupedHeaderFrequencies with 3 empty arrays
    RX_state.groupedHeaderFrequencies = Array.from({ length: repetitions }, () => []);

    // Process header tones for each repetition
    for (let repetition = 0; repetition < repetitions; repetition++) {
        for (let toneIndex = 0; toneIndex < tonesPerHeader; toneIndex++) {
            const toneStartTime = datumStartTime + (repetition * tonesPerHeader + toneIndex) * HEADER_TONE_DURATION;
            const toneEndTime = toneStartTime + HEADER_TONE_DURATION;

            // Find all frequencies within the tone's time range
            const toneFrequencies = RX_state.rawReceivedFrequencies
                .filter(({ startTime, duration }) => {
                    const endTime = startTime + duration;
                    return startTime >= toneStartTime && endTime <= toneEndTime;
                })
                .map(({ frequency }) => frequency);

            // Calculate the mode average (most frequently occurring frequency)
            const modeFrequency = calculateMode(toneFrequencies);
            RX_state.groupedHeaderFrequencies[repetition].push(modeFrequency);
        }
    }

    return RX_state.groupedHeaderFrequencies;
}

// Helper: Calculate the mode (most frequently occurring element)
function calculateMode(array) {
    const frequencyMap = {};
    array.forEach((value) => {
        frequencyMap[value] = (frequencyMap[value] || 0) + 1;
    });

    let mode = null;
    let maxCount = -1;
    for (const [value, count] of Object.entries(frequencyMap)) {
        if (count > maxCount) {
            mode = Number(value);
            maxCount = count;
        }
    }
    return mode;
}





function majorityVote(headerArrays) {
    const tonesPerHeader = headerArrays[0].length;

    const result = [];
    for (let i = 0; i < tonesPerHeader; i++) {
        // Extract the i-th tone from each array
        const toneSet = headerArrays.map((array) => array[i]);
        const majorityTone = calculateMode(toneSet); // Use the mode calculation from above
        result.push(majorityTone);
    }

    return result;
}




function decodeHeaderAndUpdateUI(headerFrequencies) {
        // Function to snap to the nearest frequency
    const snapToFrequency = (frequency) => {
        let snappedChar = null;
        let minDifference = Infinity;

        // Iterate over the character-to-frequency map
        for (const [char, expectedFreq] of Object.entries(CHAR_FREQ_MAP)) {
            const diff = Math.abs(frequency - expectedFreq);
            if (diff < minDifference && diff <= RX_SNAP_THRESHOLD) {
                snappedChar = char; // Snap to this character
                minDifference = diff;
            }
        }

        return snappedChar || '-'; // Return '-' if no valid snap is found
    };

    // Decode the header string with snapping
    const decodedHeader = headerFrequencies
        .map((frequency) => snapToFrequency(frequency)) // Snap frequencies to characters
        .join('');

    console.log("Decoded Header String:", decodedHeader);

    // Split the header into components
    const [sender, recipient, mode] = decodedHeader.split('-');

    // Inject the details into the HTML
    document.getElementById('image-type').textContent = mode || 'N/A';
    document.getElementById('sender-callsign').textContent = sender || 'N/A';
    document.getElementById('recipient-callsign').textContent = recipient || 'N/A';

    // Example: Add meta information (e.g., distance from sender's callsign)
    const distanceFrom = getCallsignMeta(sender); // Placeholder function to calculate distance
    document.getElementById('distance').textContent = distanceFrom || 'N/A';

    return { sender, recipient, mode }; // Return decoded components for further use if needed
}








