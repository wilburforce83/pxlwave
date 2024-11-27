// receive.js - Refactored

let RX_state = {
    startTime: 0,
    datumStartTime: 0,
    headerReceived: false,
    imageStarted: false,
    imageDecoding: null,
    currentPixel: 0,
    gridData: new Array(1024).fill(0),
    headerData: {},
    errorCount: 0,
    lastProcessedToneIndex: 0,
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
let RX_startListeningTimeout = null;
let RXtime;

// Constants
const RX_EXPECTED_FREQUENCIES = [
    CALIBRATION_TONE_MIN,
    CALIBRATION_TONE_MAX,
    ...Object.values(CHAR_FREQ_MAP),
    ..._32C_TONE_MAP,
];

// Initialize Web Worker
RX_worker = new Worker('../src/RX/RX_worker.js');
// receive.js

RX_worker.onmessage = (event) => {
    const { detectedFrequency, startTime, duration, maxMagnitude, frequencyMagnitudes } = event.data;

    RXtime = startTime - RX_state.startTime;
   // console.log(RXtime,startTime,RX_state.startTime);
    // Log the magnitudes for each frequency
    //  console.log('Start time', startTime);

    // Log the detected frequency and its magnitude
    console.log(`Detected Frequency: ${detectedFrequency}, Magnitude: ${maxMagnitude}`);

    if (detectedFrequency) {
        RX_state.rawReceivedFrequencies.push({ startTime, duration, frequency: detectedFrequency });
    }
    if (RXtime > 15000 && !RX_state.headerReceived) {
        RX_state.headerReceived = true;
        const HeaderFrequencies = headerFECArr();
        console.log(HeaderFrequencies);

        if (!HeaderFrequencies) {
            RX_stopListening();
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

        // Initialize the audio context
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const constraints = deviceId
            ? { audio: { deviceId: { exact: deviceId } } }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!stream) {
            console.error("No audio stream detected!");
            return;
        }
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);

        // Initialize GainNode for automatic gain adjustment
        const gainNode = RX_audioContext.createGain();
        RX_microphoneStream.connect(gainNode);

        // Measure the noise floor and adjust gain
        await adjustGainToNoiseFloor(gainNode);
        // Continue connecting the audio chain (e.g., Bandpass Filter, Compressor)
        console.log("Gain adjustment complete, proceeding with audio chain...");
        // Add Bandpass Filter if enabled
        let bandpassFilter = null;
        if (RX_BANDPASS_STATE) {
            bandpassFilter = RX_audioContext.createBiquadFilter();
            bandpassFilter.type = "bandpass";
            bandpassFilter.frequency.value = 1200; // Center frequency
            bandpassFilter.Q = 1; // Quality factor
            gainNode.connect(bandpassFilter); // Chain bandpass filter
        }

        // Add Compressor if enabled
        let compressor = null;
        if (RX_COMPRESSOR_STATE) {
            compressor = RX_audioContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-50, RX_audioContext.currentTime); // Threshold in dB
            compressor.knee.setValueAtTime(40, RX_audioContext.currentTime); // Knee in dB
            compressor.ratio.setValueAtTime(12, RX_audioContext.currentTime); // Compression ratio
            compressor.attack.setValueAtTime(0.003, RX_audioContext.currentTime); // Attack time
            compressor.release.setValueAtTime(0.25, RX_audioContext.currentTime); // Release time
            (bandpassFilter || gainNode).connect(compressor); // Chain compressor
        }

        // Add Analyser Node
        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = FFT_SIZE;
        RX_dataArray = new Float32Array(RX_analyser.frequencyBinCount);

        (compressor || bandpassFilter || gainNode).connect(RX_analyser);

        // Start real-time amplitude monitoring
        monitorAmplitude();

        addToLog(`Microphone stream initialized using device: ${deviceId || 'default'}`, 'info');
        RX_startListening();
    } catch (error) {
        console.error('Error initializing microphone stream:', error);
        addToLog('Failed to initialize microphone stream.', 'err');
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

    RX_startListeningTimeout = setTimeout(() => {
        if (!TX_Active) {
           // resetRXState();
            RX_state.startTime = performance.now();
            toggleRxTag(true);
            RX_isListening = true;
            addToLog('Listening for tones...', 'info');
            
            processMicrophoneInput();

            RX_listeningTimeout = setTimeout(() => {
                if (!RX_state.headerReceived) {
                    RX_stopListening();
                    
                }
            }, 20000); // Timeout for RX listening
        }
    }, timeUntilNextListen);
}

function RX_stopListening() {
    RX_isListening = false;
    toggleRxTag(false);
    resetRXState()
    if (RX_audioContext) RX_audioContext.suspend();
    clearTimeout(RX_listeningTimeout);
    clearTimeout(RX_startListeningTimeout);
    console.log('Stopped listening.');
    // reset and get ready for next time:
    RX_startListening();
}

// Process microphone input
function processMicrophoneInput() {
    if (!RX_isListening) return;
    let startTime = performance.now();
    RX_analyser.getFloatTimeDomainData(RX_dataArray);
    const windowedSamples = applyHammingWindow(Array.from(RX_dataArray));

    RX_worker.postMessage({
        startTime: startTime,
        samples: windowedSamples,
        sampleRate: RX_audioContext.sampleRate,
        expectedFrequencies: RX_EXPECTED_FREQUENCIES,
        calibrationOffset: RX_state.calibration.offset,
    });

    setTimeout(processMicrophoneInput, RX_ANALYSIS_INTERVAL);
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
    
    RX_state.datumStartTime= 0;
    RX_state.headerReceived= false;
    RX_state.imageStarted= false;
    RX_state.currentPixel= 0;
    RX_state.gridData= new Array(1024).fill(0);
    RX_state.headerData= {};
    RX_state.errorCount= 0;
    RX_state.lastProcessedToneIndex= 0;
    RX_state.rawReceivedFrequencies= []; // Raw frequency collection
    RX_state.groupedHeaderFrequencies= []; // Grouped frequencies after majority voting
    RX_state.groupedImageFrequencies= [];
    RX_state.toneLog= [];
    RX_state.calibration= {
        minTone: null,
            maxTone: null,
            offset: 0,
        }
    };

function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

function headerFECArr() {
    const repetitions = 3; // 3 repetitions of the header tones
    const tonesPerHeader = MAX_CHAR_HEADER; // Number of tones in the header
    const datumFrequency = CALIBRATION_TONE_MAX; // Calibration frequency to find datum timestamp
    const maxDatumTime = RX_state.startTime + 20000; // Maximum time for the datum start
    let SanitisedFrequencies = dropRogueTonesObjects(RX_state.rawReceivedFrequencies, HEADER_TONE_DURATION / (RX_ANALYSIS_INTERVAL * 2), "frequency")

    // Find the datum startTime (last occurrence of 1800 Hz within the maxDatumTime window)
    const datumElement = SanitisedFrequencies
        .filter(({ frequency, startTime }) => frequency === datumFrequency && startTime < maxDatumTime)
        .pop();

    if (!datumElement) {
        console.error("No datum frequency (1800 Hz) found within the specified time window.");
        return null;
    }

    RX_state.datumStartTime = datumElement.startTime + (HEADER_TONE_DURATION * 0.75);

    // Initialize groupedHeaderFrequencies with 'repetitions' number of empty arrays
    RX_state.groupedHeaderFrequencies = Array.from({ length: repetitions }, () => []);

    // Process header tones for each repetition
    for (let repetition = 0; repetition < repetitions; repetition++) {
        for (let toneIndex = 0; toneIndex < tonesPerHeader; toneIndex++) {
            // Calculate the center time of the current tone
            const toneCenterTime = RX_state.datumStartTime + (repetition * tonesPerHeader + toneIndex) * HEADER_TONE_DURATION;

            // Calculate the time window (±20% of HEADER_TONE_DURATION around the center)
            const timeWindowStart = toneCenterTime - (HEADER_TONE_DURATION * 0.1);
            const timeWindowEnd = toneCenterTime + (HEADER_TONE_DURATION * 0.1);

            // Find all frequencies whose startTime falls within the time window
            const toneFrequencies = SanitisedFrequencies
                .filter(({ startTime }) => startTime >= timeWindowStart && startTime <= timeWindowEnd)
                .map(({ frequency }) => frequency);

            // Calculate the mode frequency (most frequently occurring frequency)
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
        // Only include valid numbers
        if (typeof value === 'number' && !isNaN(value)) {
            frequencyMap[value] = (frequencyMap[value] || 0) + 1;
        }
    });

    let mode = null;
    let maxCount = -1;

    // Find the mode among valid numbers
    for (const [value, count] of Object.entries(frequencyMap)) {
        if (count > maxCount) {
            mode = Number(value);
            maxCount = count;
        }
    }

    // If no valid mode found, attempt to find a single valid number
    if ((mode === null || isNaN(mode))) {
        for (let i = 0; i < array.length; i++) {
            if (typeof array[i] === 'number' && !isNaN(array[i])) {
                mode = array[i];
                break;
            }
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

        return snappedChar || ''; // Return '-' if no valid snap is found
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
    addToLog("Header Recieved", 'rx', sender);
    // Example: Add meta information (e.g., distance from sender's callsign)
    const distanceFrom = getCallsignMeta(sender); // Placeholder function to calculate distance
    document.getElementById('distance').textContent = distanceFrom || 'N/A';
    // After processing the header and obtaining RX_state.datumStartTime
    // Start the processing interval after the header is processed
    let ImageInterval = FEC ? (TONE_DURATION*32*3) : TONE_DURATION*32;
    RX_state.imageDecoding = setInterval(() => {
        processImageData();
    }, ImageInterval); // Adjust the interval timing as needed
    return { sender, recipient, mode }; // Return decoded components for further use if needed
};



async function adjustGainToNoiseFloor(gainNode) {
    return new Promise((resolve) => {
        const analyser = RX_audioContext.createAnalyser();
        analyser.fftSize = 256; // Small FFT size for quick updates
        gainNode.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);

        let startTime = performance.now();
        let noiseSum = 0;
        let count = 0;

        const measureNoise = () => {
            analyser.getFloatFrequencyData(dataArray);

            // Ensure dataArray contains valid values
            if (!dataArray.some((value) => !isNaN(value) && value !== 0)) {
                addToLog("No audio detected! Check input stream.", "err");
                resolve(); // Abort adjustment
                return;
            }

            // Calculate noise floor (average magnitude in dB)
            const noiseFloor = dataArray.reduce((sum, value) => sum + Math.abs(value), 0) / bufferLength;
            if (isFinite(noiseFloor)) {
                noiseSum += -Math.abs(noiseFloor);
                count++;
            }


            if (performance.now() - startTime < 500) {
                requestAnimationFrame(measureNoise);
            } else {
                // Calculate average noise floor
                const avgNoiseFloor = noiseSum / count;
                console.log(`NoiseSum = ${noiseSum}, count = ${count}`);
                // Prevent invalid or infinite values
                if (isNaN(avgNoiseFloor) || !isFinite(avgNoiseFloor)) {
                    console.error("Invalid noise floor calculation. Adjusting gain aborted.");
                    resolve();
                    return;
                }

                // Adjust gain to normalize noise floor
                const targetNoiseFloor = -10; // Target noise floor in dB
                const gainAdjustment = Math.pow(10, (targetNoiseFloor - avgNoiseFloor) / 20);
                gainNode.gain.setValueAtTime(gainAdjustment, RX_audioContext.currentTime);

                console.log(`Noise floor adjusted: Avg ${avgNoiseFloor.toFixed(2)} dB, Gain set to ${gainAdjustment}`);
                resolve();
            }
        };

        measureNoise();
    });
}




function dropRogueTones(tonesArray, minConsecutive) {
    // Result array to hold the filtered tones
    const filteredTones = [];
    let currentStreak = [];

    for (let i = 0; i < tonesArray.length; i++) {
        // If the current tone matches the previous one, add it to the streak
        if (currentStreak.length === 0 || tonesArray[i] === currentStreak[0]) {
            currentStreak.push(tonesArray[i]);
        } else {
            // Check if the streak meets the minimum consecutive requirement
            if (currentStreak.length >= minConsecutive) {
                filteredTones.push(...currentStreak);
            }
            // Reset the streak for the next tone
            currentStreak = [tonesArray[i]];
        }
    }

    // Check the last streak
    if (currentStreak.length >= minConsecutive) {
        filteredTones.push(...currentStreak);
    }

    return filteredTones;
}

function dropRogueTonesObjects(tonesArray, minConsecutive, key) {
    const filteredTones = [];
    let currentStreak = [];

    for (let i = 0; i < tonesArray.length; i++) {
        // If the current streak is empty or the current tone matches the streak key
        if (currentStreak.length === 0 || tonesArray[i][key] === currentStreak[0][key]) {
            currentStreak.push(tonesArray[i]);
        } else {
            // Check if the streak meets the minimum consecutive requirement
            if (currentStreak.length >= minConsecutive) {
                filteredTones.push(...currentStreak);
            }
            // Reset the streak for the next tone
            currentStreak = [tonesArray[i]];
        }
    }

    // Check the last streak
    if (currentStreak.length >= minConsecutive) {
        filteredTones.push(...currentStreak);
    }

    return filteredTones;
};









