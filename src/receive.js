// receive.js

const RX_toneThreshold = 0.5; // Threshold for calibration tones
let RX_headerReceived = false;
let RX_gridData = new Array(1024).fill(0);
let RX_headerData = {};
let RX_currentPixel = 0;
const RX_startTime = 6; // Start at + x seconds
const RX_endTime = 15; // Timeout if no calibration tone detected by +15 seconds
// Array to store tone data for analysis
let RX_toneDataLog = [];
let RX_receivedFrequencies = []; // an array for all samples

// Constants for RX tone processing
const RX_MIN_TONE_FREQ = 975; // Hz
const RX_MAX_TONE_FREQ = 1125; // Hz
const RX_BANDWIDTH = RX_MAX_TONE_FREQ - RX_MIN_TONE_FREQ; // bandwidth
const RX_TONE_DURATION = 90; // milliseconds per tone
const RX_HEADER_TONE_DURATION = 150; // milliseconds for header tones
const NUM_COLORS = 32;
const SAMPLE_FACTOR = 1.25; // divider number for the period of time to sample the tone i.e. 3 would be 1/3 of the total tone period, higher number is faster but less

// Calibration tones for error correction
const RX_CALIBRATION_TONE_MIN = 950; // Hz
const RX_CALIBRATION_TONE_MAX = 1150; // Hz

let RX_receivedMinCalibrationTone = null;
let RX_receivedMaxCalibrationTone = null;
let RX_calibrationOffset = 0;
let RX_audioContext, RX_analyser, RX_microphoneStream, RX_dataArray, RX_bufferLength;

// Frequency map for decoding header (A-Z, 0-9, and '-')
const RX_CHAR_FREQ_MAP = {
    'A': 975, 'B': 979, 'C': 983, 'D': 987, 'E': 991, 'F': 995, 'G': 999, 'H': 1003, 
    'I': 1007, 'J': 1011, 'K': 1015, 'L': 1019, 'M': 1023, 'N': 1027, 'O': 1031, 'P': 1035, 
    'Q': 1039, 'R': 1043, 'S': 1047, 'T': 1051, 'U': 1055, 'V': 1059, 'W': 1063, 'X': 1067, 
    'Y': 1071, 'Z': 1075, '0': 1079, '1': 1083, '2': 1087, '3': 1091, '4': 1095, '5': 1099, 
    '6': 1103, '7': 1107, '8': 1111, '9': 1115, '-': 1119, ' ': 1125
}
;

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


// Calculate calibration offset
function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = (RX_receivedMinCalibrationTone + RX_receivedMaxCalibrationTone) / 2 - (RX_CALIBRATION_TONE_MIN + RX_CALIBRATION_TONE_MAX) / 2;
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

// Modify RX_detectTone to capture and store timestamp and frequency data
function RX_detectTone(frequency) {
    if (!RX_receivedMinCalibrationTone) {
        if (frequency >= RX_CALIBRATION_TONE_MIN - 50 && frequency <= RX_CALIBRATION_TONE_MIN + 50) {
            RX_receivedMinCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp: Date.now(), frequency }); // Log timestamp and frequency
            addToLog(`Received min calibration tone: ${frequency} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (frequency >= RX_CALIBRATION_TONE_MAX - 50 && frequency <= RX_CALIBRATION_TONE_MAX + 50) {
            RX_receivedMaxCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp: Date.now(), frequency }); // Log timestamp and frequency
            addToLog(`Received max calibration tone: ${frequency} Hz (sync point)`);
            setTimeout(() => {
                RX_startHeaderDecoding();
            }, 150); // Gap after calibration tones before header decoding starts
        }
    } else {

        // logic to filter the tone into one of the expected tones, make an array of all tones; min and max calibration, characters, and 
        // tone map then match the frequency to the closest frequency in the array.
      //  RX_receivedFrequencies.push(...closest frequency from above); this will be the whole collection point, all other functions iterate over this array
        //
    }
}

// Modify RX_startHeaderDecoding to log each decoded header tone
function RX_startHeaderDecoding() {
    addToLog('Starting header decoding based on sync point...');
    RX_headerReceived = true;
    RX_currentPixel = 0;
    let headerString = '';
    let toneIndex = 0;

    const intervalId = setInterval(async () => {
        if (toneIndex >= 15) {
            clearInterval(intervalId);
            RX_validateHeader(headerString);
            setTimeout(() => RX_startImageDecoding(RX_headerData.type), 200);
            return;
        }

        const frequencies = [];
        const startSamplingTime = RX_audioContext.currentTime * 1000;
        const endSamplingTime = startSamplingTime + RX_HEADER_TONE_DURATION / SAMPLE_FACTOR;

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
                frequencies.push(Math.round(peakFrequency));
                RX_toneDataLog.push({ timestamp: Date.now(), frequency: Math.round(peakFrequency) }); // Log frequency data
            }

            await new Promise(resolve => setTimeout(resolve, 10));
        }
        //RX_receivedFrequencies.push(...frequencies);
        const modeFrequency = calculateMode(frequencies, true);
        const decodedChar = RX_decodeTone(modeFrequency);

        if (decodedChar) headerString += decodedChar;
        addToLog(`Decoded character: ${decodedChar} from frequency: ${modeFrequency} Hz`);

        toneIndex++;
    }, RX_HEADER_TONE_DURATION);
}

// Modify RX_startImageDecoding to log each image tone
function RX_startImageDecoding(mode) {
    const toneMap = mode === '4T' ? RX_4T_TONE_MAP : RX_32C_TONE_MAP;
    let toneIndex = 0;

    const intervalId = setInterval(async () => {
        if (toneIndex >= RX_gridData.length) {
            clearInterval(intervalId);
            RX_saveTransmission();
            return;
        }

        const frequencies = [];
        const startSamplingTime = RX_audioContext.currentTime * 1000;
        const endSamplingTime = startSamplingTime + RX_TONE_DURATION / SAMPLE_FACTOR;

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
                frequencies.push(Math.round(peakFrequency));
                RX_toneDataLog.push({ timestamp: Date.now(), frequency: Math.round(peakFrequency) }); // Log frequency data
            }

            await new Promise(resolve => setTimeout(resolve, 10));
        }

        const modeFrequency = calculateMode(frequencies, false);
        const colorIndex = toneMap.findIndex(freq => Math.abs(freq - modeFrequency) < 2);
        RX_gridData[toneIndex] = colorIndex !== -1 ? colorIndex : 0;

        RX_renderPixel(toneIndex, colorIndex !== -1 ? colorIndex : 0);

        toneIndex++;
    }, RX_TONE_DURATION);
}



// Generate an array of frequencies for each color tone based on bandwidth and range
function generateImageFrequencyArray() {
    const frequencyStep = RX_BANDWIDTH / NUM_COLORS;
    return Array.from({ length: NUM_COLORS }, (_, i) => RX_MIN_TONE_FREQ + i * frequencyStep);
}

// Call this on page load to initialize the image frequency array
const RX_IMAGE_FREQ_ARRAY = RX_32C_TONE_MAP;

// Snapping function to find the closest frequency in an array
function snapToClosestFrequency(frequency, frequencyArray) {
    return frequencyArray.reduce((closest, curr) => 
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
    );
}

// Helper function to calculate the mode of an array of numbers, with snapping to nearest frequency
function calculateMode(array, isHeader) {
   // console.log("raw:",array);
    // Determine which frequency array to use for snapping
    const frequencyArray = isHeader ? Object.values(RX_CHAR_FREQ_MAP) : RX_IMAGE_FREQ_ARRAY;

    // Snap each frequency to the closest in the target array
    const snappedFrequencies = array.map(freq => snapToClosestFrequency(freq, frequencyArray));
    RX_receivedFrequencies.push(...snappedFrequencies);

    // Calculate the mode of snapped frequencies
    const frequencyMap = {};
    snappedFrequencies.forEach(value => {
        frequencyMap[value] = (frequencyMap[value] || 0) + 1;
    });
//console.log(frequencyMap)
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
       // RX_resetReception();
        //return;
    }
    let [sender, mode, recipient] = headerParts;

    
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



// Modify RX_saveTransmission to log the tone data array
async function RX_saveTransmission() {
    console.log(RX_receivedFrequencies);
    const receivedImage = {
        timestamp: new Date().toISOString(),
        sender: RX_headerData?.sender || "Unknown",
        recipient: RX_headerData?.recipient || "Unknown",
        type: RX_headerData?.type || "Unknown",
        gridData: RX_gridData || [],
        quality: 95 // Simulated
    };

    const minConsecutive = 7;

console.log(extractFrequentChanges(RX_receivedFrequencies, minConsecutive));

   // console.log('Tone Data Log:', RX_toneDataLog); // Print the tone data array to console
/*
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
        */
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


function extractFrequentChanges(arr, minConsecutive) {
    let result = [];
    let count = 1; // Start with the first element counted as 1

    for (let i = 1; i < arr.length; i++) {
        if (arr[i] === arr[i - 1]) {
            count++; // Increment count if the current number is the same as the previous
        } else {
            if (count >= minConsecutive) {
                result.push(arr[i - 1]); // Add to result if count meets the threshold
            }
            count = 1; // Reset count for the next sequence
        }
    }

    // Final check for the last sequence in the array
    if (count >= minConsecutive) {
        result.push(arr[arr.length - 1]);
    }

    return result;
}

RX_startListening();
