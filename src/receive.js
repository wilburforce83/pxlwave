// receive.js

const RX_toneThreshold = 0.15; // Threshold for calibration tones
let RX_headerReceived = false;
let RX_gridData = new Array(1024).fill(0);
let RX_headerData = {};
let RX_currentPixel = 0;
const RX_startTime = 6; // Start at +4 seconds
const RX_endTime = 15; // Timeout if no calibration tone detected by +15 seconds

// Constants for RX tone processing
const RX_MIN_TONE_FREQ = 1000; // Hz
const RX_MAX_TONE_FREQ = 1100; // Hz
const RX_BANDWIDTH = RX_MAX_TONE_FREQ - RX_MIN_TONE_FREQ; // 100Hz bandwidth
const RX_TONE_DURATION = 150; // 50 milliseconds per tone
const RX_HEADER_TONE_DURATION = 150; // 100 milliseconds for header tones
const NUM_COLORS = 32;

// Calibration tones for error correction
const RX_CALIBRATION_TONE_MIN = 950; // Hz
const RX_CALIBRATION_TONE_MAX = 1150; // Hz

let RX_receivedMinCalibrationTone = null;
let RX_receivedMaxCalibrationTone = null;
let RX_calibrationOffset = 0;
let RX_audioContext, RX_analyser, RX_microphoneStream, RX_dataArray, RX_bufferLength;

// Frequency map for decoding header (A-Z, 0-9, and '-')
const RX_CHAR_FREQ_MAP = {
    'A': 1000, 'B': 1005, 'C': 1010, 'D': 1015, 'E': 1020, 'F': 1025, 'G': 1030, 'H': 1035,
    'I': 1040, 'J': 1045, 'K': 1050, 'L': 1055, 'M': 1060, 'N': 1065, 'O': 1070, 'P': 1075,
    'Q': 1080, 'R': 1085, 'S': 1090, 'T': 1095, 'U': 1100, 'V': 1105, 'W': 1110, 'X': 1115,
    'Y': 1120, 'Z': 1125, '0': 1130, '1': 1135, '2': 1140, '3': 1145, '4': 1150, '5': 1155,
    '6': 1160, '7': 1165, '8': 1170, '9': 1175, '-': 1180, ' ': 1185
};

// Define constants for tone mapping
const RX_32C_TONE_MAP = Array.from({ length: 32 }, (_, i) => RX_MIN_TONE_FREQ + i * (RX_BANDWIDTH / 32));
const RX_4T_TONE_MAP = Array.from({ length: 4 }, (_, i) => RX_MIN_TONE_FREQ + i * (RX_BANDWIDTH / 4));

// Start microphone stream for input processing
async function RX_startMicrophoneStream() {
    try {
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);
        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = 32768; // Set FFT size for frequency analysis
        RX_bufferLength = RX_analyser.frequencyBinCount;
        RX_dataArray = new Uint8Array(RX_bufferLength);

        RX_microphoneStream.connect(RX_analyser);
        RX_processMicrophoneInput(); // Start processing microphone input
    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}

// Decode tone based on calibration offset
function RX_decodeTone(frequency) {
    const adjustedFreq = frequency - RX_calibrationOffset;
    let closestChar = findClosestKey(adjustedFreq);
    return closestChar;
}

function findClosestKey(adjustedFreq) {
    return Object.keys(RX_CHAR_FREQ_MAP).reduce((closestKey, key) => {
        const currentFreq = RX_CHAR_FREQ_MAP[key];
        const closestFreq = RX_CHAR_FREQ_MAP[closestKey];
        return Math.abs(currentFreq - adjustedFreq) < Math.abs(closestFreq - adjustedFreq) ? key : closestKey;
    });
}

// Process microphone input in real-time
function RX_processMicrophoneInput() {
    RX_analyser.getByteFrequencyData(RX_dataArray);

    let maxAmplitude = 0;
    let peakFrequency = 0;
    const nyquist = RX_audioContext.sampleRate / 2;
    const lowBin = Math.floor((900 / nyquist) * RX_bufferLength);
    const highBin = Math.ceil((1300 / nyquist) * RX_bufferLength);

    for (let i = lowBin; i <= highBin; i++) {
        if (RX_dataArray[i] > maxAmplitude) {
            maxAmplitude = RX_dataArray[i];
            peakFrequency = (i / RX_bufferLength) * nyquist;
        }
    }

    if (peakFrequency >= 900 && peakFrequency <= 1300 && maxAmplitude > RX_toneThreshold) {
        RX_detectTone(peakFrequency);
    }

    requestAnimationFrame(RX_processMicrophoneInput);
}

// Detect and process incoming tones
function RX_detectTone(frequency) {
    if (!RX_receivedMinCalibrationTone) {
        if (frequency >= RX_CALIBRATION_TONE_MIN - 50 && frequency <= RX_CALIBRATION_TONE_MIN + 50) {
            RX_receivedMinCalibrationTone = frequency;
            addToLog(`Received min calibration tone: ${frequency} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (frequency >= RX_CALIBRATION_TONE_MAX - 50 && frequency <= RX_CALIBRATION_TONE_MAX + 50) {
            RX_receivedMaxCalibrationTone = frequency;
            addToLog(`Received max calibration tone: ${frequency} Hz (sync point)`);
           // RX_calculateCalibrationOffset();
            setTimeout(RX_startHeaderDecoding,525);
        }
    }
}

// Calculate calibration offset
function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = (RX_receivedMinCalibrationTone + RX_receivedMaxCalibrationTone) / 2 - (RX_CALIBRATION_TONE_MIN + RX_CALIBRATION_TONE_MAX) / 2;
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

function RX_startHeaderDecoding() {
    addToLog('Starting header decoding based on sync point...');
    RX_headerReceived = true;
    RX_currentPixel = 0;
    let headerString = '';
    let toneIndex = 0;

    const intervalId = setInterval(async () => {
        if (toneIndex >= 15) {
            clearInterval(intervalId); // Stop interval after header is decoded
            RX_validateHeader(headerString);
            return;
        }

        const frequencies = [];
        const startSamplingTime = RX_audioContext.currentTime * 1000;
        const endSamplingTime = startSamplingTime + RX_HEADER_TONE_DURATION / 1.5;

        // Sample frequencies for one-third of RX_HEADER_TONE_DURATION
        while (RX_audioContext.currentTime * 1000 < endSamplingTime) {
            RX_analyser.getByteFrequencyData(RX_dataArray);

            let maxAmplitude = 0;
            let peakFrequency = 0;
            const nyquist = RX_audioContext.sampleRate / 2;
            const lowBin = Math.floor((900 / nyquist) * RX_bufferLength);
            const highBin = Math.ceil((1300 / nyquist) * RX_bufferLength);

            for (let i = lowBin; i <= highBin; i++) {
                if (RX_dataArray[i] > maxAmplitude) {
                    maxAmplitude = RX_dataArray[i];
                    peakFrequency = (i / RX_bufferLength) * nyquist;
                }
            }

            if (peakFrequency >= 900 && peakFrequency <= 1300) {
                frequencies.push(Math.round(peakFrequency)); // Round to nearest Hz
            }

            // Small delay to reduce CPU usage
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Determine the most common frequency in the sampling period
        const modeFrequency = calculateMode(frequencies,true);
        const decodedChar = RX_decodeTone(modeFrequency);

        if (decodedChar) headerString += decodedChar;
        addToLog(`Decoded character: ${decodedChar} from frequency: ${modeFrequency} Hz`);

        toneIndex++;
    }, RX_HEADER_TONE_DURATION); // Trigger every full tone duration
}

function RX_startImageDecoding(mode) {
    const toneMap = mode === '4T' ? RX_4T_TONE_MAP : RX_32C_TONE_MAP;
    let toneIndex = 0;

    const intervalId = setInterval(async () => {
        if (toneIndex >= RX_gridData.length) {
            clearInterval(intervalId); // Stop interval after all tones are decoded
            RX_saveTransmission();
            return;
        }

        const frequencies = [];
        const startSamplingTime = RX_audioContext.currentTime * 1000;
        const endSamplingTime = startSamplingTime + RX_TONE_DURATION / 1.5;

        // Sample frequencies for one-third of RX_TONE_DURATION
        while (RX_audioContext.currentTime * 1000 < endSamplingTime) {
            RX_analyser.getByteFrequencyData(RX_dataArray);

            let maxAmplitude = 0;
            let peakFrequency = 0;
            const nyquist = RX_audioContext.sampleRate / 2;
            const lowBin = Math.floor((900 / nyquist) * RX_bufferLength);
            const highBin = Math.ceil((1300 / nyquist) * RX_bufferLength);

            for (let i = lowBin; i <= highBin; i++) {
                if (RX_dataArray[i] > maxAmplitude) {
                    maxAmplitude = RX_dataArray[i];
                    peakFrequency = (i / RX_bufferLength) * nyquist;
                }
            }

            if (peakFrequency >= 900 && peakFrequency <= 1300) {
                frequencies.push(Math.round(peakFrequency)); // Round to nearest Hz
            }

            // Small delay to reduce CPU usage
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Determine the most common frequency in the sampling period
        const modeFrequency = calculateMode(frequencies,false);
        const colorIndex = toneMap.findIndex(freq => Math.abs(freq - modeFrequency) < 2);
        RX_gridData[toneIndex] = colorIndex !== -1 ? colorIndex : 0;

        // Render the decoded tone as a pixel on the canvas
        RX_renderPixel(toneIndex, colorIndex !== -1 ? colorIndex : 0);

        toneIndex++;
    }, RX_TONE_DURATION); // Trigger every full tone duration
}



// Generate an array of frequencies for each color tone based on bandwidth and range
function generateImageFrequencyArray() {
    const frequencyStep = RX_BANDWIDTH / NUM_COLORS;
    return Array.from({ length: NUM_COLORS }, (_, i) => RX_MIN_TONE_FREQ + i * frequencyStep);
}

// Call this on page load to initialize the image frequency array
const RX_IMAGE_FREQ_ARRAY = generateImageFrequencyArray();

// Snapping function to find the closest frequency in an array
function snapToClosestFrequency(frequency, frequencyArray) {
    return frequencyArray.reduce((closest, curr) => 
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
    );
}

// Helper function to calculate the mode of an array of numbers, with snapping to nearest frequency
function calculateMode(array, isHeader) {
    console.log("raw:",array);
    // Determine which frequency array to use for snapping
    const frequencyArray = isHeader ? Object.values(RX_CHAR_FREQ_MAP) : RX_IMAGE_FREQ_ARRAY;

    // Snap each frequency to the closest in the target array
    const snappedFrequencies = array.map(freq => snapToClosestFrequency(freq, frequencyArray));

    // Calculate the mode of snapped frequencies
    const frequencyMap = {};
    snappedFrequencies.forEach(value => {
        frequencyMap[value] = (frequencyMap[value] || 0) + 1;
    });
console.log(frequencyMap)
    // Find the most frequent (mode) frequency
    let mode = null;
    let maxCount = 0;
    for (const [value, count] of Object.entries(frequencyMap)) {
        if (count > maxCount) {
            maxCount = count;
            mode = Number(value);
        }
    }

    return mode;
}



function RX_validateHeader(headerString) {
    const headerParts = headerString.split('-');
    /*
    if (headerParts.length !== 3) {
        addToLog(`Header format error: Expected 2 hyphens but found ${headerParts.length - 1}.`);
        RX_resetReception();
        return;
    }
*/
    let [sender, mode, recipient] = headerParts;

    /*
    if (mode !== '32C' && mode !== '4T') {
        addToLog(`Invalid mode in header: "${mode}" (Expected "32C" or "4T")`);
        mode = 'ERR';
    }

    if (sender.length > 8 || sender.length < 2) {
        addToLog(`Sender callsign length invalid: "${sender}"`);
        sender = 'ERR';
    }
    if (recipient.length > 8 || recipient.length < 2) {
        addToLog(`Recipient callsign length invalid: "${recipient}"`);
        recipient = 'ERR';
    }

    RX_headerData = { sender, recipient, type: mode };
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);

    if (sender === 'ERR' || recipient === 'ERR' || mode === 'ERR') {
        addToLog('Header validation failed, terminating reception and returning to listening mode.');
       // RX_resetReception();
       // return;
      
    }
       */
    mode = "32C";
    addToLog('Header validated successfully. Starting pixel data reception...');
    RX_startImageDecoding(mode);
}

function RX_resetReception() {
    RX_headerReceived = false;
    RX_currentPixel = 0;
    RX_gridData.fill(0);
    toggleRxTag(false);
    addToLog('Reception reset. Waiting for next scheduled start.');
}


// Function to render a single oversized pixel on the canvas as it's decoded
function RX_renderPixel(toneIndex, colorIndex) {
    const canvas = document.getElementById('rx-display');
    console.log(canvas.width);
    const ctx = canvas.getContext('2d');
    const targetSize = canvas.width; // Assuming a square canvas, e.g., 256x256
    const gridSize = 32; // 32x32 logical grid
    const pixelSize = targetSize / gridSize; // Size of each oversized pixel, e.g., 8x8 if targetSize is 256

    // Calculate the x and y positions based on the toneIndex
    const x = (toneIndex % gridSize) * pixelSize;
    const y = Math.floor(toneIndex / gridSize) * pixelSize;

    // Set the color for the current pixel based on the color index
    const color = colorPalette[colorIndex];
    ctx.fillStyle = color;
    ctx.fillRect(x, y, pixelSize, pixelSize);

    // Optional: Draw grid lines for each rendered pixel
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.8)'; // Dark grey for grid lines
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, pixelSize, pixelSize);
}



// Save decoded image data with error handling
async function RX_saveTransmission() {
    const receivedImage = {
        timestamp: new Date().toISOString(),
        sender: RX_headerData?.sender || "Unknown",
        recipient: RX_headerData?.recipient || "Unknown",
        type: RX_headerData?.type || "Unknown",
        gridData: RX_gridData || [],
        quality: 95 // Simulated
    };

    // Check if ipcRenderer is available before invoking
    if (!window.ipcRenderer?.invoke) {
        addToLog(`Error: ipcRenderer is not available for saving.`);
        console.error("ipcRenderer.invoke is undefined.");
        return;
    }

    try {
        const result = await window.ipcRenderer.invoke('save-to-collection', receivedImage);
        addToLog(result?.status === 'success' ? `Saved to collection` : `Error saving to collection`);
    } catch (error) {
        addToLog(`Error during save: ${error.message}`);
        console.error(error);
    }
}



// Countdown display function for next RX event
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
            countdownTag.style.display = 'none'; // Hide countdown when RX starts
            clearInterval(countdownInterval);
        }
    }, 1000);
}

function RX_startListening() {
    const now = new Date();
    const epoch = new Date('1970-01-01T00:00:00Z'); // Fixed epoch start

    // Calculate the time since the epoch in milliseconds
    const timeSinceEpoch = now.getTime() - epoch.getTime();

    // Calculate how many milliseconds are in a 3-minute interval
    const intervalMs = 3 * 60 * 1000;

    // Calculate the next 3-minute interval after the epoch, and add RX_startTime as an offset
    const nextInterval = new Date(epoch.getTime() + Math.ceil(timeSinceEpoch / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(RX_startTime); // Start listening at the specified offset from the interval start
    nextInterval.setUTCMilliseconds(0);

    // Calculate the remaining time until the next interval
    const timeUntilNextListen = nextInterval.getTime() - now.getTime();

    // Start countdown for the next RX event
    startRXCountdown(timeUntilNextListen);

    // Set a timeout to start listening at the precise time
    setTimeout(() => {
        toggleRxTag(true);
        addToLog('Listening for tones...');
        RX_startMicrophoneStream();

        // Stop listening after the specified RX_endTime if no transmission is detected
        setTimeout(() => {
            if (!RX_headerReceived) {
                toggleRxTag(false);
                addToLog("No transmission detected, returning...");
            }
        }, (RX_endTime - RX_startTime) * 1000);
    }, timeUntilNextListen);

    // Re-run the function every 3 minutes to re-synchronize
    setTimeout(RX_startListening, intervalMs);
}

// Function to toggle the RX status tag
function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

RX_startListening();
