// receive.js

const RX_toneThreshold = 0.5;  // Adjust as necessary to detect calibration tones
let RX_headerReceived = false;
let RX_gridData = new Array(1024).fill(0);
let RX_headerData = {};
let RX_currentPixel = 0;
const RX_startTime = +4;  // Start at +4 seconds
const RX_endTime = +15;   // Timeout if no calibration tone detected by +15 seconds

// Constants for RX tone processing
const RX_MIN_TONE_FREQ = 1000;  // Hz
const RX_MAX_TONE_FREQ = 1100;  // Hz
const RX_BANDWIDTH = RX_MAX_TONE_FREQ - RX_MIN_TONE_FREQ;  // 100Hz bandwidth
const RX_TONE_DURATION = 50;    // 50 milliseconds per tone
const RX_HEADER_TONE_DURATION = 100;  // 100 milliseconds for header tones

// Calibration tones for error correction
const RX_CALIBRATION_TONE_MIN = 950;   // Hz
const RX_CALIBRATION_TONE_MAX = 1150;  // Hz

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
    '6': 1160, '7': 1165, '8': 1170, '9': 1175, '-': 1180
};

// Get the RX status element for visual updates
const RX_statusElem = document.getElementById('rx-status');

// Wait for the DOM to load before accessing the canvas elements
const RX_imageTypeElem = document.getElementById('image-type');
const RX_senderElem = document.getElementById('sender-callsign');
const RX_recipientElem = document.getElementById('recipient-callsign');
const RX_canvas = document.getElementById('rx-display');
const RX_ctx = RX_canvas.getContext('2d');

// Function to log to the UI
function addToLog(message) {
    const logElem = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('li');
    logEntry.innerHTML = `<span style="color: green;">[${timestamp}]</span> ${message}`;
    logElem.appendChild(logEntry);
    logElem.scrollTop = logElem.scrollHeight;
    console.log(`[LOG] ${message}`);  // Output to console for debugging
}

// Function to render the received image progressively
function RX_renderImage(gridData) {
    const pixelSize = 4; // Adjust the pixel size as needed
    RX_ctx.clearRect(0, 0, RX_canvas.width, RX_canvas.height); // Clear canvas

    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 32; j++) {
            const colorIndex = gridData[i * 32 + j];
            const color = colorPalette[colorIndex];
            RX_ctx.fillStyle = color;
            RX_ctx.fillRect(j * pixelSize, i * pixelSize, pixelSize, pixelSize);
        }
    }
}

// Function to decode FSK tones into characters/colors based on the calibration offset
function RX_decodeTone(frequency) {
    const adjustedFreq = frequency - RX_calibrationOffset;
    console.log(`Decoding tone at frequency: ${frequency} Hz (adjusted to: ${adjustedFreq} Hz)`);  // Log the detected frequency
    for (const [freq, char] of Object.entries(RX_CHAR_FREQ_MAP)) {
        if (Math.abs(adjustedFreq - freq) <= 2.5) { // Allow a small margin for error
            console.log(`Tone matched to character: ${char}`);
            return char;
        }
    }
    console.warn(`Tone at ${frequency} Hz did not match any character.`);
    return null; // Return null if the frequency does not match
}

// Function to process microphone input and detect tones in real time
function RX_processMicrophoneInput() {
    RX_analyser.getByteFrequencyData(RX_dataArray); // Get frequency data

    // Find the peak frequency in the received data
    let maxAmplitude = 0;
    let peakFrequency = 0;
    const nyquist = RX_audioContext.sampleRate / 2; // Nyquist frequency (half of the sampling rate)
    for (let i = 0; i < RX_bufferLength; i++) {
        if (RX_dataArray[i] > maxAmplitude) {
            maxAmplitude = RX_dataArray[i];
            peakFrequency = (i / RX_bufferLength) * nyquist;
        }
    }

    // Log peak frequency for debugging
    console.log(`Peak frequency detected: ${peakFrequency} Hz with amplitude ${maxAmplitude}`);
    if (maxAmplitude > RX_toneThreshold) {
        RX_detectTone(peakFrequency); // Pass peak frequency to tone detection
    }

    requestAnimationFrame(RX_processMicrophoneInput); // Continue processing in real-time
}

// Function to detect and process incoming tones
function RX_detectTone(frequency) {
    if (!RX_headerReceived) {
        // First, detect the calibration tones and calculate the offset
        if (!RX_receivedMinCalibrationTone && frequency >= RX_CALIBRATION_TONE_MIN - 50 && frequency <= RX_CALIBRATION_TONE_MIN + 50) {
            RX_receivedMinCalibrationTone = frequency;
            addToLog(`Received min calibration tone: ${frequency} Hz`);
        } else if (!RX_receivedMaxCalibrationTone && frequency >= RX_CALIBRATION_TONE_MAX - 50 && frequency <= RX_CALIBRATION_TONE_MAX + 50) {
            RX_receivedMaxCalibrationTone = frequency;
            addToLog(`Received max calibration tone: ${frequency} Hz`);
            RX_calculateCalibrationOffset();
            RX_receiveHeader(); // Once both calibration tones are received, proceed to header
        }
    } else {
        // Once calibration tones are received, proceed to decode the header and pixel data
        if (RX_headerReceived) {
            RX_receivePixelData(frequency);
        }
    }
}

// Function to start listening to microphone input
async function RX_startMicrophoneStream() {
    try {
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);
        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = 2048; // Set FFT size for frequency analysis
        RX_bufferLength = RX_analyser.frequencyBinCount;
        RX_dataArray = new Uint8Array(RX_bufferLength);

        RX_microphoneStream.connect(RX_analyser);
        RX_processMicrophoneInput(); // Start processing microphone input
        addToLog('Microphone stream started, waiting for tones...');
    } catch (error) {
        console.error('Error accessing microphone:', error);
        addToLog('Error accessing microphone. Please check permissions.');
    }
}

// Function to calculate the calibration offset based on the received calibration tones
function RX_calculateCalibrationOffset() {
    const receivedBandwidth = RX_receivedMaxCalibrationTone - RX_receivedMinCalibrationTone;
    const expectedBandwidth = RX_MAX_TONE_FREQ - RX_MIN_TONE_FREQ;
    RX_calibrationOffset = (RX_receivedMinCalibrationTone - RX_CALIBRATION_TONE_MIN) + (receivedBandwidth - expectedBandwidth) / 2;
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

// Function to receive the header and log it
async function RX_receiveHeader() {
    addToLog('Receiving header data...');

    const headerString = await RX_decodeHeader(); // Decode the header tones
    const [sender, recipient, mode] = headerString.split('-');

    RX_headerData = {
        sender: sender || 'CALLSIGN123',
        recipient: recipient || 'CQ',
        type: mode || '32C'
    };

    // Update the UI
    RX_imageTypeElem.textContent = RX_headerData.type;
    RX_senderElem.textContent = RX_headerData.sender;
    RX_recipientElem.textContent = RX_headerData.recipient;

    // Log header information
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);
    RX_headerReceived = true;

    // Begin receiving pixel data
    addToLog('Receiving pixel data...');
}

// Function to decode header tones
async function RX_decodeHeader() {
    let headerString = '';
    for (let i = 0; i < 10; i++) {  // Adjust length based on expected header size
        RX_analyser.getByteFrequencyData(RX_dataArray);
        let maxAmplitude = 0;
        let peakFrequency = 0;
        const nyquist = RX_audioContext.sampleRate / 2;
        for (let i = 0; i < RX_bufferLength; i++) {
            if (RX_dataArray[i] > maxAmplitude) {
                maxAmplitude = RX_dataArray[i];
                peakFrequency = (i / RX_bufferLength) * nyquist;
            }
        }

        const decodedChar = RX_decodeTone(peakFrequency);
        if (decodedChar) {
            headerString += decodedChar;
        }
    }
    return headerString;
}

// Function to listen for and decode incoming pixel data
function RX_receivePixelData(frequency) {
    if (RX_currentPixel >= RX_gridData.length) {
        RX_saveTransmission();
        toggleRxTag(false);
        return;
    }

    // Decode the received tone into the corresponding pixel color index
    const colorIndex = RX_decodeTone(frequency);
    RX_gridData[RX_currentPixel] = colorIndex !== null ? colorIndex : 0; // Use decoded color index or default to 0

    RX_currentPixel++;
    RX_renderImage(RX_gridData); // Render the image as it is received
}

// Function to save the received image to collection
async function RX_saveTransmission() {
    const quality = 95; // Simulated quality, e.g., 95% success

    // Store the received image in the collection
    const receivedImage = {
        timestamp: new Date().toISOString(),
        sender: RX_headerData.sender,
        recipient: RX_headerData.recipient,
        type: RX_headerData.type,
        gridData: RX_gridData,
        quality: quality
    };

    const result = await window.ipcRenderer.invoke('save-to-collection', receivedImage);

    if (result.status === 'success') {
        addToLog(`Saved to collection, quality: ${quality}%`);
    } else {
        addToLog(`Error saving to collection: ${result.message}`);
    }
}

// Automatically trigger listening every minute at +4 seconds
function RX_startListening() {
    const now = new Date();
    const seconds = now.getSeconds();

    if (seconds === RX_startTime) {
        toggleRxTag(true);
        addToLog('Listening for tones...');
        RX_startMicrophoneStream(); // Start streaming from the microphone

        // Timeout if no tone detected by +15 seconds
        setTimeout(() => {
            if (!RX_headerReceived) {
                toggleRxTag(false);
                addToLog("No transmission detected, returning...");
                return;
            }
        }, (RX_endTime - RX_startTime) * 1000);
    }

    setTimeout(RX_startListening, 1000); // Check every second
}

// Function to toggle the RX status tag
function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}

// Start listening
RX_startListening();
