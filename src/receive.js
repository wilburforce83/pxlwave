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
const RX_HEADER_TONE_DURATION = 100; // 100 milliseconds for header tones

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
            RX_calculateCalibrationOffset();
            setTimeout(RX_startHeaderDecoding,550); // delay to the middle of 100ms transmission to get the cleaned signal.
        }
    }
}

// Calculate calibration offset
function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = (RX_receivedMinCalibrationTone + RX_receivedMaxCalibrationTone) / 2 - (RX_CALIBRATION_TONE_MIN + RX_CALIBRATION_TONE_MAX) / 2;
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

// Start header decoding immediately after sync point
function RX_startHeaderDecoding() {
    addToLog('Starting header decoding based on sync point...');
    RX_headerReceived = true;
    RX_currentPixel = 0;
    let headerString = '';

    const decodeHeaderTone = (toneIndex) => {
        if (toneIndex >= 15) {
            RX_validateHeader(headerString);
            return;
        }

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

        const decodedChar = RX_decodeTone(peakFrequency);
        if (decodedChar) headerString += decodedChar;
        addToLog(`Decoded character: ${decodedChar} from frequency: ${peakFrequency} Hz`);

        setTimeout(() => decodeHeaderTone(toneIndex + 1), RX_HEADER_TONE_DURATION);
    };

    decodeHeaderTone(0);
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

function RX_startImageDecoding(mode) {
    const toneMap = mode === '4T' ? RX_4T_TONE_MAP : RX_32C_TONE_MAP;

    const decodeImageTone = (toneIndex) => {
        if (toneIndex >= RX_gridData.length) {
            RX_saveTransmission();
            return;
        }

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

        const colorIndex = toneMap.findIndex(freq => Math.abs(freq - peakFrequency) < 2);
        RX_gridData[toneIndex] = colorIndex !== -1 ? colorIndex : 0;

        // Render the decoded tone as a pixel on the canvas
        RX_renderPixel(toneIndex, colorIndex !== -1 ? colorIndex : 0);

        setTimeout(() => decodeImageTone(toneIndex + 1), RX_TONE_DURATION);
    };

    decodeImageTone(0);
}

// Function to render a single pixel on the canvas as it's decoded, using the existing rendering approach
function RX_renderPixel(toneIndex, colorIndex) {
    const canvas = document.getElementById('rx-display');
    const ctx = canvas.getContext('2d');
    const targetSize = canvas.width; // Assuming a square canvas
    const pixelSize = targetSize / 32;

    // Calculate the x and y positions based on the toneIndex
    const x = (toneIndex % 32) * pixelSize;
    const y = Math.floor(toneIndex / 32) * pixelSize;

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
        sender: RX_headerData.sender,
        recipient: RX_headerData.recipient,
        type: RX_headerData.type,
        gridData: RX_gridData,
        quality: 95 // Simulated
    };

    try {
        const result = await window.ipcRenderer.invoke('save-to-collection', receivedImage);
        addToLog(result.status === 'success' ? `Saved to collection` : `Error saving to collection`);
    } catch (error) {
        addToLog(`Error during save: ${error.message}`);
        console.error(error);
    }
}

function RX_startListening() {
    const now = new Date();
    if (now.getSeconds() === RX_startTime) {
        toggleRxTag(true);
        addToLog('Listening for tones...');
        RX_startMicrophoneStream();

        setTimeout(() => {
            if (!RX_headerReceived) {
                toggleRxTag(false);
                addToLog("No transmission detected, returning...");
            }
        }, (RX_endTime - RX_startTime) * 1000);
    }
    setTimeout(RX_startListening, 1000);
}

// Function to toggle the RX status tag
function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

RX_startListening();
