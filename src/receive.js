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
let errorCount = 0; // Variable to count errors during decoding

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
let RX_collectingFrequencies = false;

// Frequency map for decoding header (A-Z, 0-9, and '-')
const RX_CHAR_FREQ_MAP = {
    'A': 975, 'B': 979, 'C': 983, 'D': 987, 'E': 991, 'F': 995, 'G': 999, 'H': 1003, 
    'I': 1007, 'J': 1011, 'K': 1015, 'L': 1019, 'M': 1023, 'N': 1027, 'O': 1031, 'P': 1035, 
    'Q': 1039, 'R': 1043, 'S': 1047, 'T': 1051, 'U': 1055, 'V': 1059, 'W': 1063, 'X': 1067, 
    'Y': 1071, 'Z': 1075, '0': 1079, '1': 1083, '2': 1087, '3': 1091, '4': 1095, '5': 1099, 
    '6': 1103, '7': 1107, '8': 1111, '9': 1115, '-': 1119, ' ': 1125
};

// Define constants for tone mapping
const RX_32C_TONE_MAP = Array.from({ length: 32 }, (_, i) => RX_MIN_TONE_FREQ + i * (RX_BANDWIDTH / 32));
const RX_4T_TONE_MAP = Array.from({ length: 4 }, (_, i) => RX_MIN_TONE_FREQ + i * (RX_BANDWIDTH / 4));

// Collect all expected frequencies into an array
const RX_EXPECTED_FREQUENCIES = [
    RX_CALIBRATION_TONE_MIN,
    RX_CALIBRATION_TONE_MAX,
    ...Object.values(RX_CHAR_FREQ_MAP),
    ...RX_32C_TONE_MAP
];

let RX_listeningTimeout;

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

    // Adjusted to include frequencies outside the expected range (silence)
    RX_detectTone(peakFrequency, maxAmplitude);

    requestAnimationFrame(RX_processMicrophoneInput);
}

// Modify RX_detectTone to capture and store timestamp and frequency data
function RX_detectTone(frequency, amplitude) {
    const timestamp = Date.now();

    if (!RX_receivedMinCalibrationTone) {
        if (Math.abs(frequency - RX_CALIBRATION_TONE_MIN) <= 50) {
            RX_receivedMinCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency }); // Log timestamp and frequency
            addToLog(`Received min calibration tone: ${frequency} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (Math.abs(frequency - RX_CALIBRATION_TONE_MAX) <= 50) {
            RX_receivedMaxCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency }); // Log timestamp and frequency
            addToLog(`Received max calibration tone: ${frequency} Hz (sync point)`);
            // Now that we have both calibration tones, calculate offset
            RX_calculateCalibrationOffset();
            // Start collecting frequencies
            RX_collectingFrequencies = true;
            // Optionally, set a timeout to stop listening after expected transmission duration
            setTimeout(() => {
                RX_collectingFrequencies = false;
                // Process the collected frequencies
                const condensedFrequencies = condenseFrequencies(RX_receivedFrequencies.map(item => item.frequency));
                processCollectedFrequencies(condensedFrequencies);
            }, RX_expectedTransmissionDuration());
        }
    } else if (RX_collectingFrequencies) {
        // Adjust frequency using calibration offset
        const adjustedFreq = frequency - RX_calibrationOffset;
        // Find the closest expected frequency or map to 0 if outside range
        const snappedFrequency = snapToClosestFrequency(adjustedFreq);
        // Push to RX_receivedFrequencies
        RX_receivedFrequencies.push({ frequency: snappedFrequency, timestamp });
        // Optionally, store timestamp and raw frequency
        RX_toneDataLog.push({ timestamp, frequency, snappedFrequency });
    }
}

// Calculate calibration offset
function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = ((RX_receivedMinCalibrationTone + RX_receivedMaxCalibrationTone) / 2) - ((RX_CALIBRATION_TONE_MIN + RX_CALIBRATION_TONE_MAX) / 2);
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

// Snapping function to find the closest frequency in the expected frequencies or return 0 if outside range
function snapToClosestFrequency(frequency) {
    const threshold = 50; // Threshold to consider frequency as valid
    let closestFrequency = RX_EXPECTED_FREQUENCIES.reduce((closest, curr) => 
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
    );
    if (Math.abs(closestFrequency - frequency) > threshold) {
        errorCount++;
        return 0; // Return 0 for silence or unexpected frequency
    }
    return closestFrequency;
}

// Function to condense frequencies based on consecutive repetitions
function condenseFrequencies(frequencies) {
    let condensed = [];
    let currentFreq = frequencies[0];
    let count = 1;

    for (let i = 1; i < frequencies.length; i++) {
        if (frequencies[i] === currentFreq) {
            count++;
        } else {
            if (count > 2) { // If the frequency lasted more than two frames
                condensed.push(currentFreq);
            }
            currentFreq = frequencies[i];
            count = 1;
        }
    }
    // Handle the last frequency
    if (count > 2) {
        condensed.push(currentFreq);
    }

    return condensed;
}

// Process collected frequencies to decode header and image data
function processCollectedFrequencies(frequencies) {
    console.log(frequencies);
    addToLog('Processing collected frequencies to decode header and image data...');

    // Initialize variables
    let index = 0;
    let mode = 'HEADER'; // or 'IMAGE'
    let headerString = '';
    let pixelData = [];
    let pixelIndex = 0;

    while (index < frequencies.length) {
        let freq = frequencies[index];

        // Handle silence (0) or gaps in transmission
        if (freq === 0) {
            index++;
            continue;
        }

        // Check for calibration tones
        if (Math.abs(freq - (RX_CALIBRATION_TONE_MIN + RX_calibrationOffset)) < 10 ||
            Math.abs(freq - (RX_CALIBRATION_TONE_MAX + RX_calibrationOffset)) < 10) {
            // It's a calibration tone, move to the next frequency
            index++;
            continue;
        }

        // The next frequency after calibration tone is a character/pixel tone
        let toneFreq = freq + RX_calibrationOffset;

        if (mode === 'HEADER') {
            // Decode header character
            const char = findClosestChar(toneFreq);
            if (char) {
                headerString += char;
            } else {
                headerString += '?'; // Unknown character
                errorCount++;
                addToLog(`Warning: Could not decode character at index ${index}, frequency ${toneFreq} Hz`);
            }

            index++;
            // Check for calibration tone between characters
            if (index < frequencies.length) {
                const nextFreq = frequencies[index];
                if (Math.abs(nextFreq - (RX_CALIBRATION_TONE_MIN + RX_calibrationOffset)) < 10) {
                    index++; // Skip calibration tone
                }
            }

            // Check if header is complete (e.g., length or termination condition)
            if (headerString.length >= 15) {
                addToLog(`Decoded header: ${headerString}`);
                RX_validateHeader(headerString);
                mode = 'IMAGE'; // Switch to image decoding
            }
        } else if (mode === 'IMAGE') {
            // Decode image pixel
            // Determine expected calibration tone before pixel
            const expectedCalibrationTone = (pixelIndex % 32 === 0 && pixelIndex !== 0) ? 
                RX_CALIBRATION_TONE_MAX + RX_calibrationOffset : RX_CALIBRATION_TONE_MIN + RX_calibrationOffset;

            // Check if previous frequency was expected calibration tone
            const prevFreq = frequencies[index - 1] || 0;
            if (Math.abs(prevFreq - expectedCalibrationTone) > 10) {
                errorCount++;
                addToLog(`Warning: Expected calibration tone before pixel ${pixelIndex}, but got ${prevFreq} Hz`);
            }

            // Find the closest tone in RX_32C_TONE_MAP
            const colorIndex = RX_32C_TONE_MAP.findIndex(freq => Math.abs(freq - toneFreq) < 2);

            if (colorIndex !== -1) {
                pixelData.push(colorIndex);
            } else {
                pixelData.push(0); // Default color if not matched
                errorCount++;
                addToLog(`Warning: Could not match pixel tone at pixel ${pixelIndex}, frequency ${toneFreq} Hz`);
            }

            pixelIndex++;
            index++;

            // Check if image is complete
            if (pixelIndex >= 1024) {
                break;
            }

            // Skip calibration tone between pixels
            if (index < frequencies.length) {
                const nextFreq = frequencies[index];
                if (Math.abs(nextFreq - (RX_CALIBRATION_TONE_MIN + RX_calibrationOffset)) < 10 ||
                    Math.abs(nextFreq - (RX_CALIBRATION_TONE_MAX + RX_calibrationOffset)) < 10) {
                    index++; // Skip calibration tone
                }
            }
        }
    }

    // Update RX_gridData with pixelData
    RX_gridData = pixelData;

    // Render the image
    for (let i = 0; i < RX_gridData.length; i++) {
        RX_renderPixel(i, RX_gridData[i]);
    }

    // Save the transmission
    RX_saveTransmission();
}

function RX_validateHeader(headerString) {
    const headerParts = headerString.split('-');
    if (headerParts.length !== 3) {
        addToLog(`Header format error: Expected 2 hyphens but found ${headerParts.length - 1}.`);
        errorCount++;
        // Continue processing
    }
    let [senderCallsign, recipientCallsign, mode] = headerParts;

    if (mode !== '32C' && mode !== '4T') {
        addToLog(`Invalid mode in header: "${mode}" (Expected "32C" or "4T")`);
        mode = '32C'; // Default to 32C
        errorCount++;
    }

    RX_headerData = { sender: senderCallsign.trim(), recipient: recipientCallsign.trim(), type: mode.trim() };
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);

    addToLog('Header validated successfully.');
    RX_headerReceived = true;
}

// Function to find the closest character based on frequency
function findClosestChar(frequency) {
    const threshold = 10; // Threshold to consider frequency as valid
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
        return null; // Return null if frequency is not close enough
    }
    return closestChar;
}

// Estimate expected transmission duration based on known timings
function RX_expectedTransmissionDuration() {
    const headerDuration = 500 + 500 + (15 * (RX_HEADER_TONE_DURATION + 60)) + 500 + 200;
    const imageDuration = 1024 * (RX_TONE_DURATION + 60) + ((1024 / 32) * 60);
    return headerDuration + imageDuration + 5000; // Additional buffer
}

// Function to render a single oversized pixel on the canvas as it's decoded
function RX_renderPixel(toneIndex, colorIndex) {
    const canvas = document.getElementById('rx-display');
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
        quality: 95, // Simulated
        errorCount: errorCount // Include error count
    };

    console.log('Tone Data Log:', RX_toneDataLog); // Print the tone data array to console
    addToLog(`Total errors during decoding: ${errorCount}`);

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
        RX_listeningTimeout = setTimeout(() => {
            if (!RX_headerReceived) {
                toggleRxTag(false);
               // addToLog("No transmission detected, returning...");
                // Stop the microphone stream
                if (RX_microphoneStream) {
                    RX_microphoneStream.disconnect();
                }
                if (RX_audioContext) {
                    RX_audioContext.close();
                }
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
