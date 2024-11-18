// receive.js

// Set up variables
let RX_headerReceived = false;
let RX_imageStarted = false;
let RX_gridData = new Array(1024).fill(0);
let RX_headerData = {};
let RX_currentPixel = 0;
let RX_toneDataLog = []; // Array to store tone data for analysis
let RX_receivedFrequencies = []; // An array for all raw samples
let RX_processedFrequencies = []; // An array for processed frequencies
let RX_lineCount = 0;
let errorCount = 0; // Variable to count errors during decoding
let RX_receivedMinCalibrationTone = null;
let RX_receivedMaxCalibrationTone = null;
let RX_calibrationOffset = 0;
let RX_calibrationMaxTimestamp = null; // Timestamp of last calibration max tone
let RX_audioContext, RX_analyser, RX_microphoneStream, RX_dataArray, RX_bufferLength;
let RX_collectingFrequencies = false;
let RX_processingScheduled = false;
let countdown = 5;
let RX_now = false;
let RX_isProcessing = false; // Flag to prevent duplicate processing loops
let RX_listeningTimeout = null;

// Generate array of all expected frequencies
const RX_EXPECTED_FREQUENCIES = [
    CALIBRATION_TONE_MIN,
    CALIBRATION_TONE_MAX,
    END_OF_LINE,
    ...Object.values(CHAR_FREQ_MAP),
    ..._32C_TONE_MAP
];

// Set up worker.js to offload RX_processMicrophoneInput();
const worker = new Worker('../src/worker.js');

worker.onmessage = function (event) {
    const { detectedFrequency, magnitude } = event.data;
    if (detectedFrequency && magnitude > RX_AMPLITUDE_THRESHOLD) {
        RX_detectTone(detectedFrequency, magnitude);
    }
};

async function RX_startMicrophoneStream() {
    try {
        // Stop and clean up the previous stream and context
        if (RX_microphoneStream) {
            const tracks = RX_microphoneStream.mediaStream.getTracks();
            tracks.forEach(track => track.stop());
        }
        if (RX_audioContext) {
            RX_audioContext.close();
        }

        // Create a new AudioContext and microphone stream
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);
        console.log("Microphone stream initialized:", stream);

        let lastNode = RX_microphoneStream; // Start with the microphone stream

        // Step 1: (Optional) Create Band-Pass Filter to isolate expected frequencies
        if (RX_BANDPASS_STATE) {
            const bandPass = RX_audioContext.createBiquadFilter();
            bandPass.type = 'bandpass';
            bandPass.frequency.value = (MIN_TONE_FREQ + MAX_TONE_FREQ) / 2; // Center frequency
            bandPass.Q.value = (MAX_TONE_FREQ - MIN_TONE_FREQ) / MIN_TONE_FREQ; // Quality factor
            console.log("Band-pass filter configured with center frequency:", bandPass.frequency.value);
            const bandwidth = bandPass.frequency.value / bandPass.Q.value;
            console.log("Effective Bandwidth:", bandwidth);

            RX_microphoneStream.connect(bandPass);
            lastNode = bandPass; // Update the last node to the band-pass filter
        } else {
            console.log("Band-pass filter bypassed.");
        }

        // Step 2: (Optional) Add Dynamics Compressor for noise suppression
        if (RX_COMPRESSOR_STATE) {
            const compressor = RX_audioContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(RX_COMPRESSOR_THRESH, RX_audioContext.currentTime); // Less aggressive compression
            compressor.knee.setValueAtTime(40, RX_audioContext.currentTime);
            compressor.ratio.setValueAtTime(12, RX_audioContext.currentTime);
            compressor.attack.setValueAtTime(0, RX_audioContext.currentTime);
            compressor.release.setValueAtTime(0.25, RX_audioContext.currentTime);
            console.log("Compressor configured.");

            lastNode.connect(compressor);
            lastNode = compressor; // Update the last node to the compressor
        } else {
            console.log("Compressor bypassed.");
        }

        // Step 3: Create Analyser Node for frequency domain analysis
        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = FFT_SIZE; // Moderate FFT size for testing
        RX_bufferLength = RX_analyser.frequencyBinCount;
        RX_dataArray = new Float32Array(RX_bufferLength);
        console.log("Analyzer configured with FFT size:", RX_analyser.fftSize);

        // Connect the last node to the analyser
        lastNode.connect(RX_analyser);

        console.log("Audio processing chain connected: Microphone -> (Optional Band-Pass Filter) -> (Optional Compressor) -> Analyser");

        // Reset processing flag and start microphone processing
        RX_isProcessing = false;
        RX_processMicrophoneInput();
    } catch (error) {
        console.error("Error accessing microphone:", error);
    }
}

function RX_processMicrophoneInput() {
    if (RX_isProcessing) return; // Prevent duplicate loops
    RX_isProcessing = true;

    function process() {
        if (!RX_isProcessing) return; // Stop processing if the flag is false

        RX_analyser.getFloatTimeDomainData(RX_dataArray);

        const maxAmplitude = Math.max(...RX_dataArray);
        if (maxAmplitude < RX_AMPLITUDE_THRESHOLD) {
            // Skip processing if the signal is too weak
            setTimeout(process, RX_ANALYSIS_INTERVAL);
            return;
        }

        const samples = Array.from(RX_dataArray);
        const windowedSamples = applyHammingWindow(samples);

        // Send data to Web Worker for processing
        worker.postMessage({
            samples: windowedSamples,
            sampleRate: RX_audioContext.sampleRate,
            expectedFrequencies: RX_EXPECTED_FREQUENCIES,
            calibrationOffset: RX_calibrationOffset,
            amplitudeThreshold: RX_AMPLITUDE_THRESHOLD
        });

        setTimeout(process, RX_ANALYSIS_INTERVAL);
    }

    process(); // Start the processing loop
}

async function restartMicrophoneStream() {
    RX_isProcessing = false; // Stop the current loop
    if (RX_audioContext) RX_audioContext.close(); // Close the current audio context
    await RX_startMicrophoneStream(); // Restart the microphone stream
    console.log('Audio stream restarted');
}

function visualizeVolume() {
    RX_analyser.getFloatTimeDomainData(RX_dataArray);
    const maxAmplitude = Math.max(...RX_dataArray);
    console.log('Volume Level:', maxAmplitude);
    requestAnimationFrame(visualizeVolume);
}

function applyHammingWindow(samples) {
    const N = samples.length;
    return samples.map((sample, n) => sample * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1))));
}

function RX_detectTone(frequency, amplitude) {
    const timestamp = performance.now(); // Use high-resolution timestamp

    if (!RX_receivedMinCalibrationTone) {
        if (Math.abs(frequency - CALIBRATION_TONE_MIN) <= RX_CALIBRATION_DRIFT) {
            RX_receivedMinCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency });
            addToLog(`Received min calibration tone: ${frequency.toFixed(2)} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (Math.abs(frequency - CALIBRATION_TONE_MAX) <= RX_CALIBRATION_DRIFT) {
            RX_receivedMaxCalibrationTone = frequency;
            RX_calibrationMaxTimestamp = timestamp; // Capture the timestamp
            RX_toneDataLog.push({ timestamp, frequency });
            addToLog(`Received max calibration tone: ${frequency.toFixed(2)} Hz (sync point)`);
            RX_calculateCalibrationOffset();
            RX_collectingFrequencies = true;
        }
    } else if (RX_collectingFrequencies) {
        // Adjust frequency with calibration offset
        const adjustedFreq = frequency - RX_calibrationOffset;
        const snappedFrequency = snapToClosestFrequency(adjustedFreq);

        if (snappedFrequency !== 0) { // Ignore invalid or out-of-threshold frequencies
            RX_receivedFrequencies.push({
                timestamp,
                frequency: adjustedFreq,
                snappedFrequency
            });
            RX_toneDataLog.push({ timestamp, frequency, snappedFrequency });

            // Schedule processing after collecting sufficient data
            if (!RX_processingScheduled) {
                RX_processingScheduled = true;

                const totalHeaderDuration = HEADER_TONE_DURATION * 17 * 3;
                const repeats = FEC ? 3 : 1;
                const gridSize = 32;
                const totalDataDuration = TONE_DURATION * gridSize * gridSize * repeats;
                const totalTransmissionTime = totalHeaderDuration + totalDataDuration;

                setTimeout(() => {
                    processCollectedFrequencies(RX_receivedFrequencies, "HEADER");
                }, totalHeaderDuration + 1000); // Add some buffer

                setTimeout(() => {
                    processCollectedFrequencies(RX_receivedFrequencies, "ALL");
                }, totalTransmissionTime + 5000); // Add buffer
            }
        }
    }
}

function snapToClosestFrequency(frequency) {
    const threshold = RX_CALIBRATION_DRIFT;
    let closestFrequency = RX_EXPECTED_FREQUENCIES.reduce((closest, curr) =>
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
        , RX_EXPECTED_FREQUENCIES[0]);

    if (Math.abs(closestFrequency - frequency) > threshold) {
        errorCount++;
        return 0; // Return 0 for silence or unexpected frequency
    }

    return closestFrequency === END_OF_LINE ? "EOL" : closestFrequency;
}

function processCollectedFrequencies(data, type) {
    const windows = organizeFrequenciesIntoWindows();

    calculateModeFrequencies(windows);

    if (type === "HEADER") {
        decodeHeader(windows);
    } else if (type === "ALL") {
        if (!RX_imageStarted) {
            RX_imageStarted = true;
            decodeImageData(windows, RX_headerData.type);
        }
    }
}

function organizeFrequenciesIntoWindows() {
    const windows = [];
    const totalHeaderTones = 17 * 3; // 17 characters, repeated 3 times
    const repeats = FEC ? 3 : 1;
    const gridSize = 32;
    const totalDataTones = gridSize * gridSize * repeats;
    const headerToneDuration = HEADER_TONE_DURATION;
    const dataToneDuration = TONE_DURATION;

    const toneDurations = [];

    // Add header tones
    for (let i = 0; i < totalHeaderTones; i++) {
        toneDurations.push(headerToneDuration);
    }
    // Add data tones
    for (let i = 0; i < totalDataTones; i++) {
        toneDurations.push(dataToneDuration);
    }

    let currentTime = RX_calibrationMaxTimestamp;
    for (let i = 0; i < toneDurations.length; i++) {
        const duration = toneDurations[i];
        windows.push({
            start: currentTime,
            end: currentTime + duration,
            frequencies: []
        });
        currentTime += duration;
    }

    // Organize frequencies into windows
    RX_receivedFrequencies.forEach((data) => {
        const { timestamp, snappedFrequency } = data;

        // Find the window this timestamp belongs to
        for (let i = 0; i < windows.length; i++) {
            const window = windows[i];
            if (timestamp >= window.start && timestamp < window.end) {
                window.frequencies.push(snappedFrequency);
                break;
            }
        }
    });

    return windows;
}

function calculateModeFrequencies(windows) {
    windows.forEach((window) => {
        const frequencies = window.frequencies;
        if (frequencies.length > 0) {
            window.modeFrequency = calculateMode(frequencies);
        } else {
            window.modeFrequency = null; // No tone detected
        }
    });
}

function calculateMode(frequencies) {
    const frequencyCounts = {};
    frequencies.forEach((freq) => {
        frequencyCounts[freq] = (frequencyCounts[freq] || 0) + 1;
    });
    let modeFreq = null;
    let maxCount = 0;
    for (const freq in frequencyCounts) {
        if (frequencyCounts[freq] > maxCount) {
            maxCount = frequencyCounts[freq];
            modeFreq = parseFloat(freq);
        }
    }
    return modeFreq;
}

function decodeHeader(windows) {
    const totalHeaderTones = 17 * 3;
    const headerWindows = windows.slice(0, totalHeaderTones);

    const groupedHeaderFrequencies = [];
    for (let i = 0; i < headerWindows.length; i += 3) {
        const group = [
            headerWindows[i].modeFrequency,
            headerWindows[i + 1]?.modeFrequency,
            headerWindows[i + 2]?.modeFrequency
        ];
        const majorityFreq = majorityVote(group);
        groupedHeaderFrequencies.push(majorityFreq);
    }

    // Map frequencies to characters
    const decodedHeader = groupedHeaderFrequencies.map((freq) => {
        const char = getKeyByValue(CHAR_FREQ_MAP, freq);
        return char || '?'; // Use '?' for unknown frequencies
    }).join('');

    RX_validateHeader(decodedHeader);
}

function majorityVote(frequencies) {
    const freqCounts = {};
    frequencies.forEach((freq) => {
        if (freq !== null) {
            freqCounts[freq] = (freqCounts[freq] || 0) + 1;
        }
    });
    let maxCount = 0;
    let majorityFreq = null;
    for (const freq in freqCounts) {
        if (freqCounts[freq] > maxCount) {
            maxCount = freqCounts[freq];
            majorityFreq = parseFloat(freq);
        }
    }
    return majorityFreq;
}

function getKeyByValue(object, value) {
    return Object.keys(object).find((key) => object[key] === value);
}

function decodeImageData(windows, mode) {
    const totalHeaderTones = 17 * 3;
    const repeats = FEC ? 3 : 1; // Number of repeats due to FEC
    const gridSize = 32;
    const totalDataTones = gridSize * gridSize;
    const dataWindows = windows.slice(totalHeaderTones, totalHeaderTones + totalDataTones * repeats);

    const decodetoneMap = mode === '4T' ? _4T_TONE_MAP : _32C_TONE_MAP;
    const groupedDataFrequencies = [];

    for (let i = 0; i < dataWindows.length; i += repeats) {
        const group = [];
        for (let j = 0; j < repeats; j++) {
            group.push(dataWindows[i + j]?.modeFrequency);
        }
        const majorityFreq = majorityVote(group);
        groupedDataFrequencies.push(majorityFreq);
    }

    // Map frequencies to color indices
    const decodedData = groupedDataFrequencies.map((freq) => {
        const index = decodetoneMap.indexOf(freq);
        return index >= 0 ? index : 0; // Default to 0 if not found
    });

    // Reconstruct the image grid
    reconstructImage(decodedData, gridSize);
}

function reconstructImage(decodedData, gridSize) {
    for (let i = 0; i < decodedData.length; i++) {
        const colorIndex = decodedData[i];
        RX_gridData[i] = colorIndex;
        RX_renderPixel(i, colorIndex);
    }
    RX_saveTransmission(); // Save the transmission after decoding
}

function RX_validateHeader(headerString) {
    const headerParts = headerString.trim().split('-');
    if (headerParts.length !== 3) {
        addToLog(`Header format error: Expected 2 hyphens but found ${headerParts.length - 1}.`);
        errorCount++;
    }
    let [senderCallsign, recipientCallsign, mode] = headerParts;

    if (mode !== '32C' && mode !== '4T') {
        mode = '32C';
        errorCount++;
    }
    document.getElementById('image-type').innerText = mode;
    document.getElementById('sender-callsign').innerText = senderCallsign;
    document.getElementById('recipient-callsign').innerText = recipientCallsign;
    RX_headerData = { sender: senderCallsign, recipient: recipientCallsign, type: mode };
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);
    RX_headerReceived = true;

    getCallsignMeta(senderCallsign)
        .then(qrzData => {
            if (qrzData) {
                qrz = qrzData;
                // Process the QRZ data as needed
            } else {
                console.log('No QRZ data retrieved.');
            }
        })
        .catch(error => {
            console.error('Unhandled error:', error);
        });
}

function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = 0; // Adjust if necessary
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

function RX_renderPixel(toneIndex, colorIndex) {
    const canvas = document.getElementById('rx-display');
    const ctx = canvas.getContext('2d');
    const targetSize = canvas.width;
    const gridSize = 32;
    const pixelSize = targetSize / gridSize;

    const x = (toneIndex % gridSize) * pixelSize;
    const y = Math.floor(toneIndex / gridSize) * pixelSize;

    const color = colorPalette[colorIndex];
    ctx.fillStyle = color;
    ctx.fillRect(x, y, pixelSize, pixelSize);

    ctx.strokeStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, pixelSize, pixelSize);
}

async function RX_saveTransmission() {
    console.log(RX_processedFrequencies);
    RX_lineCount = 0;

    // Construct the received image data object
    const receivedImage = {
        id: new Date().getTime(), // Unique ID based on timestamp
        timestamp: new Date().toISOString(),
        sender: RX_headerData?.sender || "Unknown",
        recipient: RX_headerData?.recipient || "Unknown",
        type: RX_headerData?.type || "Unknown",
        qrzData: qrz || "Unknown", // Uncomment if qrz data is available
        gridData: RX_gridData || [],
        quality: 95, // Needs a calculation to determine real "quality"
        errorCount: errorCount
    };

    // Log the total errors
    addToLog(`Total errors during decoding: ${errorCount}`);

    // Save the received image data to the collection in Electron Store
    try {
        const store = await setupElectronStore();
        const collection = store.get('collection', []); // Get the existing collection or initialize it
        collection.push(receivedImage); // Add the new received image data
        store.set('collection', collection); // Save the updated collection back to the store
        addToLog("Transmission saved to collection successfully.");
    } catch (error) {
        console.error("Error saving transmission to collection:", error);
        addToLog("Error saving transmission to collection.");
    }
    resetDataAfterRX();
    RX_startListening();
}

function startRXCountdown(timeUntilNextListen) {
    const countdownTag = document.getElementById('countdowntag');
    countdownTag.style.display = 'inline-block';

    countdown = Math.ceil(timeUntilNextListen / 1000);
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


function RX_startListening() {
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z');
    const timeSinceEpoch = now.getTime() - epoch.getTime();
    const intervalMs = PROCESSING_INTERVAL * 60 * 1000;

    const intervalsSinceEpoch = Math.ceil(timeSinceEpoch / intervalMs);
    const nextIntervalTime = epoch.getTime() + intervalsSinceEpoch * intervalMs;
    const nextInterval = new Date(nextIntervalTime);
    nextInterval.setUTCSeconds(RX_startTime);
    nextInterval.setUTCMilliseconds(0);

    const timeUntilNextListen = nextInterval.getTime() - now.getTime();

    console.log('now:', now);
    console.log('nextInterval:', nextInterval);
    console.log('timeUntilNextListen:', timeUntilNextListen);
    console.log('intervalMs:', intervalMs);

    startRXCountdown(timeUntilNextListen);

    setTimeout(() => {
        if (!TX_Active) {
            resetDataAfterRX();
            toggleRxTag(true);
            RX_now = true;
            addToLog('Listening for tones...');
            RX_processMicrophoneInput();

            RX_listeningTimeout = setTimeout(() => {
                if (!RX_headerReceived) {
                    console.log('Timed out');
                    toggleRxTag(false);
                    RX_now = false;
                    resetDataAfterRX();
                    RX_startListening();
                }
            }, 15000); // Adjust timeout duration as needed
        }
    }, timeUntilNextListen);

    setTimeout(RX_startListening, intervalMs);
}


function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

function resetDataAfterRX() {
    // Reset all variables
    RX_headerReceived = false;
    RX_imageStarted = false;
    RX_gridData = new Array(1024).fill(0);
    RX_headerData = {};
    RX_currentPixel = 0;
    RX_toneDataLog = []; // Array to store tone data for analysis
    RX_receivedFrequencies = []; // An array for all raw samples
    RX_processedFrequencies = []; // An array for processed frequencies
    RX_lineCount = 0;
    errorCount = 0; // Variable to count errors during decoding
    RX_receivedMinCalibrationTone = null;
    RX_receivedMaxCalibrationTone = null;
    RX_calibrationOffset = 0;
    RX_collectingFrequencies = false;
    RX_processingScheduled = false;
    console.log('Data reset for next RX');
}

// HELPER FUNCTIONS

function addToLog(message) {
    const logElement = document.getElementById('log');
    if (logElement) {
        const timestamp = new Date().toISOString();
        logElement.value += `[${timestamp}] ${message}\n`;
        logElement.scrollTop = logElement.scrollHeight;
    } else {
        console.log(`[Log] ${message}`);
    }
}

function filterFrequencies(array) {
    const result = [];
    let i = 0;

    while (i < array.length) {
        let count = 1;
        // Count consecutive identical frequencies
        while (i + count < array.length && array[i] === array[i + count]) {
            count++;
        }
        // Include the sequence if it meets the required length
        if (count >= RX_REQUIRED_SAMPLES_PER_TONE) {
            result.push(...array.slice(i, i + count));
        }
        i += count; // Move to the next sequence
    }

    return result;
}

function dropRogueTones(rawArray) {
    // Array to store the filtered tones
    let dropMin = [];

    // Temporary variables for tracking consecutive tones
    let currentTone = rawArray[0];
    let count = 0;

    // Loop through the raw array to count consecutive tones
    for (let i = 0; i <= rawArray.length; i++) {
        if (rawArray[i] === currentTone) {
            // If the tone matches the current one, increment the count
            count++;
        } else {
            // If the tone changes or we reach the end of the array
            if (count >= RX_MIN_SAMPLES_PER_TONE) {
                // Add the tone to the dropMin array if it meets the minimum sample requirement
                dropMin.push(...Array(count).fill(currentTone));
            }
            // Reset for the new tone
            currentTone = rawArray[i];
            count = 1;
        }
    }

    return dropMin;
}





(async () => {
    await RX_startMicrophoneStream();
    RX_startListening();
})();
