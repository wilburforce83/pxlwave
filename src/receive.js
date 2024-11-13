// receive.js

const RX_toneThreshold = 0.5; // Threshold for calibration tones
let RX_headerReceived = false;
let RX_imagaStarted = false;
let RX_gridData = new Array(1024).fill(0);
let RX_headerData = {};
let RX_currentPixel = 0;
const RX_startTime = 6; // Start at + x seconds
const RX_endTime = 15; // Timeout if no calibration tone detected by +15 seconds
const RX_INTERVAL = 4 // RX trigger interval
let RX_toneDataLog = []; // Array to store tone data for analysis
let RX_receivedFrequencies = []; // An array for all raw samples
let RX_processedFrequencies = []; // An array for processed frequencies
let RX_lineCount = 0;
let errorCount = 0; // Variable to count errors during decoding


// Constants for RX tone processing
const RX_MIN_TONE_FREQ = 950; // Hz
const RX_MAX_TONE_FREQ = 1350; // Hz
const RX_END_OF_LINE = 965;
const RX_BANDWIDTH = RX_MAX_TONE_FREQ - RX_MIN_TONE_FREQ; // bandwidth
const RX_TONE_DURATION = 100; // milliseconds per tone
const RX_HEADER_TONE_DURATION = 100; // milliseconds for header tones
const NUM_COLORS = 32;
const SAMPLE_FACTOR = 1.25; // divider number for the period of time to sample the tone i.e. 3 would be 1/3 of the total tone period, higher number is faster but less

// Constants for easy adjustment and testing
const RX_FFT_SIZE = 4096;          // Adjust fftSize for time resolution (was 32768)
const RX_AMPLITUDE_THRESHOLD = -37; // Adjust amplitude threshold in dB (was -90)
const RX_ANALYSIS_INTERVAL = 3;     // Adjust analysis interval in milliseconds
const RX_REQUIRED_SAMPLES_PER_TONE = 4;

// Calibration tones for error correction
const RX_CALIBRATION_TONE_MIN = 950; // Hz
const RX_CALIBRATION_TONE_MAX = 1350; // Hz

let RX_receivedMinCalibrationTone = null;
let RX_receivedMaxCalibrationTone = null;
let RX_calibrationOffset = 0;
let RX_audioContext, RX_analyser, RX_microphoneStream, RX_dataArray, RX_bufferLength;
let RX_collectingFrequencies = false;

// Adjusted RX_CHAR_FREQ_MAP for a 350 Hz bandwidth, with 9.72 Hz spacing for each tone.
const RX_CHAR_FREQ_MAP = {
    'A': 975, 'B': 984.72, 'C': 994.44, 'D': 1004.16, 'E': 1013.88, 'F': 1023.6, 'G': 1033.32, 'H': 1043.04,
    'I': 1052.76, 'J': 1062.48, 'K': 1072.2, 'L': 1081.92, 'M': 1091.64, 'N': 1101.36, 'O': 1111.08, 'P': 1120.8,
    'Q': 1130.52, 'R': 1140.24, 'S': 1149.96, 'T': 1159.68, 'U': 1169.4, 'V': 1179.12, 'W': 1188.84, 'X': 1198.56,
    'Y': 1208.28, 'Z': 1218, '0': 1227.72, '1': 1237.44, '2': 1247.16, '3': 1256.88, '4': 1266.6, '5': 1276.32,
    '6': 1286.04, '7': 1295.76, '8': 1305.48, '9': 1315.2, '-': 1324.92, ' ': 1334.64
};

// RX_32C_TONE_MAP: Derived from RX_CHAR_FREQ_MAP
const RX_32C_TONE_MAP = [
    975, 984.72, 994.44, 1004.16, 1013.88, 1023.6, 1033.32, 1043.04,
    1052.76, 1062.48, 1072.2, 1081.92, 1091.64, 1101.36, 1111.08, 1120.8,
    1130.52, 1140.24, 1149.96, 1159.68, 1169.4, 1179.12, 1188.84, 1198.56,
    1208.28, 1218, 1227.72, 1237.44, 1247.16, 1256.88, 1266.6, 1276.32
];

// RX_4T_TONE_MAP: Derived from RX_CHAR_FREQ_MAP
const RX_4T_TONE_MAP = [975, 1072.2, 1179.12, 1276.32];

const RX_EXPECTED_FREQUENCIES = [
    RX_CALIBRATION_TONE_MIN,
    RX_CALIBRATION_TONE_MAX,
    RX_END_OF_LINE,
    ...Object.values(RX_CHAR_FREQ_MAP)
];

// Start microphone stream for input processing
async function RX_startMicrophoneStream() {
    try {
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);
        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = RX_FFT_SIZE;
        RX_bufferLength = RX_analyser.frequencyBinCount;
        RX_dataArray = new Float32Array(RX_bufferLength);
        RX_microphoneStream.connect(RX_analyser);
        RX_processMicrophoneInput();
    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}

function RX_processMicrophoneInput() {
    RX_analyser.getFloatFrequencyData(RX_dataArray);
    let maxAmplitude = -Infinity;
    let peakIndex = -1;
    const nyquist = RX_audioContext.sampleRate / 2;
    const binWidth = nyquist / RX_bufferLength;
    const lowBin = Math.floor((RX_MIN_TONE_FREQ / nyquist) * RX_bufferLength);
    const highBin = Math.ceil((RX_MAX_TONE_FREQ / nyquist) * RX_bufferLength);

    for (let i = lowBin; i <= highBin; i++) {
        const amplitude = RX_dataArray[i];
        if (amplitude > maxAmplitude) {
            maxAmplitude = amplitude;
            peakIndex = i;
        }
    }

    if (peakIndex !== -1 && maxAmplitude >= RX_AMPLITUDE_THRESHOLD) {
        let mag0 = RX_dataArray[peakIndex - 1] || RX_dataArray[peakIndex];
        let mag1 = RX_dataArray[peakIndex];
        let mag2 = RX_dataArray[peakIndex + 1] || RX_dataArray[peakIndex];

        mag0 = Math.pow(10, mag0 / 20);
        mag1 = Math.pow(10, mag1 / 20);
        mag2 = Math.pow(10, mag2 / 20);

        const numerator = mag0 - mag2;
        const denominator = 2 * (mag0 - 2 * mag1 + mag2);
        const delta = denominator !== 0 ? numerator / denominator : 0;

        const interpolatedIndex = peakIndex + delta;
        const peakFrequency = interpolatedIndex * binWidth;

        RX_detectTone(peakFrequency, mag1);
    }

    setTimeout(RX_processMicrophoneInput, RX_ANALYSIS_INTERVAL);
}

// Detect and log each tone to RX_receivedFrequencies
function RX_detectTone(frequency, amplitude) {
    const timestamp = Date.now();

    if (!RX_receivedMinCalibrationTone) {
        if (Math.abs(frequency - RX_CALIBRATION_TONE_MIN) <= 50) {
            RX_receivedMinCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency });
            addToLog(`Received min calibration tone: ${frequency} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (Math.abs(frequency - RX_CALIBRATION_TONE_MAX) <= 50) {
            RX_receivedMaxCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency });
            addToLog(`Received max calibration tone: ${frequency} Hz (sync point)`);
            RX_calculateCalibrationOffset();
            RX_collectingFrequencies = true;
            setTimeout(() => processCollectedFrequencies(RX_receivedFrequencies, "HEADER"), RX_HEADER_TONE_DURATION * 30 * 2);
            setTimeout(() => processCollectedFrequencies(RX_receivedFrequencies, "ALL"), (RX_TONE_DURATION * 64) + 5000);
        }
    } else if (RX_collectingFrequencies) {
        const adjustedFreq = Math.round(frequency * 1000) / 1000;
        const snappedFrequency = snapToClosestFrequency(adjustedFreq);
        RX_receivedFrequencies.push(snappedFrequency);
        RX_toneDataLog.push({ timestamp, frequency, snappedFrequency });
    }
}

function processCollectedFrequencies(data, type) {
    console.log('Process Collected Frequencies Tiggered', type);
    RX_processedFrequencies = [];
    let currentGroup = [];
    let lastFrequency = null;

    for (let i = 0; i < data.length; i++) {
        const freq = data[i];
        if ((freq === RX_CALIBRATION_TONE_MIN || freq === RX_CALIBRATION_TONE_MAX) || (lastFrequency !== null && freq !== lastFrequency)) {
            if (currentGroup.length >= RX_REQUIRED_SAMPLES_PER_TONE) {
                RX_processedFrequencies.push(currentGroup[0]);
            }
            currentGroup = (freq === RX_CALIBRATION_TONE_MIN || freq === RX_CALIBRATION_TONE_MAX) ? [] : [freq];
        } else {
            currentGroup.push(freq);
        }
        lastFrequency = freq;
    }

    if (currentGroup.length >= RX_REQUIRED_SAMPLES_PER_TONE) {
        RX_processedFrequencies.push(currentGroup[0]);
    }

    if (type === "HEADER") {
        const first15Elements = RX_processedFrequencies.slice(0, 15);
        let decodedString = '';
        for (const frequency of first15Elements) {
            const char = findClosestChar(frequency);
            if (char !== null) {
                decodedString += char;
            }
        }
        RX_validateHeader(decodedString);
    }

    if (type === "ALL" && !RX_imagaStarted) {
        RX_imagaStarted = true;
        RX_lineCount = 0;
        setTimeout(() => RX_startImageDecoding(RX_headerData.type), RX_TONE_DURATION * 64 + RX_TONE_DURATION);
    }
    console.log("RX_processedFrequencies length;", RX_processedFrequencies.length)

}

function RX_startImageDecoding(mode) {
    const toneMap = mode === '4T' ? RX_4T_TONE_MAP : RX_32C_TONE_MAP;
    let toneIndex = 15;
    const gridSize = 32;
    let currentLine = [];

    const intervalId = setInterval(() => {
        if (toneIndex >= RX_processedFrequencies.length || toneIndex > (gridSize * gridSize) + (gridSize * 2)) {
            // Finish decoding if all frequencies processed
            if (currentLine.length > 0 && currentLine.length < gridSize) {
                fillMissingTones(currentLine, gridSize, toneMap);
            }
            RX_collectingFrequencies = false;
            RX_saveTransmission();
            clearInterval(intervalId);
            return;
        }

        const currentFreq = RX_processedFrequencies[toneIndex];

        if (currentFreq === "EOL") {
            // Render the completed line
            if (currentLine.length < gridSize) {
                fillMissingTones(currentLine, gridSize, toneMap);
            }
            renderLine(currentLine);
            currentLine = [];
            RX_lineCount++;
            toneIndex++;
            return;
        }

        currentLine.push(currentFreq);
        if (toneIndex % 10 === 0) {
            processCollectedFrequencies(RX_receivedFrequencies, "ALL");
            console.log(`Processing all frequencies up to toneIndex ${toneIndex}`);
        }
        toneIndex++;
    }, RX_TONE_DURATION * 2.1);

    function fillMissingTones(line, targetLength, toneMap) {
        const mostFrequentTone = getMostFrequentTone(line);
        while (line.length < targetLength) {
            line.push(mostFrequentTone);
            errorCount++;
        }
    }

    function getMostFrequentTone(line) {
        const frequencyCount = line.reduce((acc, freq) => {
            acc[freq] = (acc[freq] || 0) + 1;
            return acc;
        }, {});
        return parseFloat(Object.keys(frequencyCount).reduce((a, b) => frequencyCount[a] > frequencyCount[b] ? a : b));
    }

    function renderLine(line) {
        line.forEach((freq, i) => {
            const colorIndex = toneMap.findIndex(tone => Math.abs(tone - freq) < 2);
            RX_gridData[RX_lineCount * gridSize + i] = colorIndex !== -1 ? colorIndex : 0;
            RX_renderPixel(RX_lineCount * gridSize + i, colorIndex !== -1 ? colorIndex : 0);
        });
    }
}



function RX_validateHeader(headerString) {
    const headerParts = headerString.split('-');
    if (headerParts.length !== 3) {
        addToLog(`Header format error: Expected 2 hyphens but found ${headerParts.length - 1}.`);
        errorCount++;
    }
    let [senderCallsign, recipientCallsign, mode] = headerParts;

    if (mode !== '32C' && mode !== '4T') {
        // addToLog(`Invalid mode in header: "${mode}" (Expected "32C" or "4T")`);
        mode = '32C';
        errorCount++;
    }
    document.getElementById('image-type').innerText = mode;
    document.getElementById('sender-callsign').innerText = senderCallsign;
    document.getElementById('recipient-callsign').innerText = recipientCallsign;
RX_headerData = { sender: senderCallsign.trim(), recipient: recipientCallsign.trim(), type: mode.trim() };
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);
    RX_headerReceived = true;
    getCallsignMeta(senderCallsign);
    

}

function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = ((RX_receivedMinCalibrationTone + RX_receivedMaxCalibrationTone) / 2) - ((RX_CALIBRATION_TONE_MIN + RX_CALIBRATION_TONE_MAX) / 2);
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

function snapToClosestFrequency(frequency) {
    const threshold = 4;
    let closestFrequency = RX_EXPECTED_FREQUENCIES.reduce((closest, curr) =>
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
    );
    if (Math.abs(closestFrequency - frequency) > threshold) {
        if (closestFrequency == RX_END_OF_LINE) {
            return "EOL"; // End of line element to prevent loss of EOL if low frequency is lost.
        } else {
            errorCount++;
            return 0; // Return 0 for silence or unexpected frequency
        }
    }

    return closestFrequency == RX_END_OF_LINE ? "EOL" : closestFrequency;
}

function findClosestChar(frequency) {
    const threshold = 4;
    let closestChar = null;
    let minDiff = Infinity;
    for (const [char, freq] of Object.entries(RX_CHAR_FREQ_MAP)) {
        const diff = Math.abs(freq - frequency);
        if (diff < minDiff) {
            minDiff = diff;
            closestChar = char;
        }
    }
    if (minDiff > threshold) {
        errorCount++;
        return null;
    }
    return closestChar;
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
        qrzData: qrz || "Unknown", // Uncomment if qrz.location is available
        gridData: RX_gridData || [],
        quality: 95,
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
}


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

function RX_startListening() {
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z');
    const timeSinceEpoch = now.getTime() - epoch.getTime();
    const intervalMs = RX_INTERVAL * 60 * 1000;
    const nextInterval = new Date(epoch.getTime() + Math.ceil(timeSinceEpoch / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(RX_startTime);
    nextInterval.setUTCMilliseconds(0);

    const timeUntilNextListen = nextInterval.getTime() - now.getTime();
    startRXCountdown(timeUntilNextListen);

    setTimeout(() => {
        toggleRxTag(true);
        addToLog('Listening for tones...');
        RX_startMicrophoneStream();

        RX_listeningTimeout = setTimeout(() => {
            if (!RX_headerReceived) {
                toggleRxTag(false);
                if (RX_microphoneStream) RX_microphoneStream.disconnect();
                if (RX_audioContext) RX_audioContext.close();
            }
        }, (RX_endTime - RX_startTime) * 1000);
    }, timeUntilNextListen);

    setTimeout(RX_startListening, intervalMs);
}

function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

RX_startListening();
