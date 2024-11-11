// receive.js

const RX_toneThreshold = 0.5; // Threshold for calibration tones
let RX_headerReceived = false;
let RX_gridData = new Array(1024).fill(0);
let RX_headerData = {};
let RX_currentPixel = 0;
const RX_startTime = 6; // Start at + x seconds
const RX_endTime = 15; // Timeout if no calibration tone detected by +15 seconds
const RX_INTERVAL = .5 // RX trigger interval
// Array to store tone data for analysis
let RX_toneDataLog = [];
let RX_receivedFrequencies = []; // an array for all samples
let errorCount = 0; // Variable to count errors during decoding

// Constants for RX tone processing
const RX_MIN_TONE_FREQ = 975; // Hz
const RX_MAX_TONE_FREQ = 1125; // Hz
const RX_BANDWIDTH = RX_MAX_TONE_FREQ - RX_MIN_TONE_FREQ; // bandwidth
const RX_TONE_DURATION = 100; // milliseconds per tone
const RX_HEADER_TONE_DURATION = 100; // milliseconds for header tones
const NUM_COLORS = 32;
const SAMPLE_FACTOR = 1.25; // divider number for the period of time to sample the tone i.e. 3 would be 1/3 of the total tone period, higher number is faster but less

// Constants for easy adjustment and testing
const RX_FFT_SIZE = 8192;          // Adjust fftSize for time resolution (was 32768)
const RX_AMPLITUDE_THRESHOLD = -70; // Adjust amplitude threshold in dB (was -90)
const RX_ANALYSIS_INTERVAL = 5;     // Adjust analysis interval in milliseconds
const RX_REQUIRED_SAMPLES_PER_TONE = 3;

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
const RX_32C_TONE_MAP = [
    975, 979, 983, 987, 991, 995, 999, 1003,
    1007, 1011, 1015, 1019, 1023, 1027, 1031, 1035,
    1039, 1043, 1047, 1051, 1055, 1059, 1063, 1067,
    1071, 1075, 1079, 1083, 1087, 1091, 1095, 1099
];
const RX_4T_TONE_MAP = [975, 1023, 1075, 1099];

// Collect all expected frequencies into an array
const RX_EXPECTED_FREQUENCIES = [
    RX_CALIBRATION_TONE_MIN,
    RX_CALIBRATION_TONE_MAX,
    ...Object.values(RX_CHAR_FREQ_MAP)
];

let RX_listeningTimeout;

// Start microphone stream for input processing
async function RX_startMicrophoneStream() {
    try {
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);
        RX_analyser = RX_audioContext.createAnalyser();

        // Set fftSize for better time resolution
        RX_analyser.fftSize = RX_FFT_SIZE;
        RX_bufferLength = RX_analyser.frequencyBinCount;
        RX_dataArray = new Float32Array(RX_bufferLength); // Use Float32Array for getFloatFrequencyData
        RX_microphoneStream.connect(RX_analyser);
        RX_processMicrophoneInput(); // Start processing microphone input
    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}

function RX_processMicrophoneInput() {
    // Ensure RX_dataArray is a Float32Array
    if (!(RX_dataArray instanceof Float32Array)) {
        RX_dataArray = new Float32Array(RX_analyser.frequencyBinCount);
    }

    // Get frequency data in decibels
    RX_analyser.getFloatFrequencyData(RX_dataArray);

    let maxAmplitude = -Infinity; // Initialize to negative infinity for dB values
    let peakIndex = -1;
    const nyquist = RX_audioContext.sampleRate / 2;
    const binWidth = nyquist / RX_bufferLength; // Frequency per bin

    const lowBin = Math.floor((925 / nyquist) * RX_bufferLength);
    const highBin = Math.ceil((1175 / nyquist) * RX_bufferLength);

    // Find the peak bin within the frequency range
    for (let i = lowBin; i <= highBin; i++) {
        const amplitude = RX_dataArray[i];
        if (amplitude > maxAmplitude) {
            maxAmplitude = amplitude;
            peakIndex = i;
        }
    }

    // Proceed only if a peak was found and it exceeds the amplitude threshold
    if (peakIndex !== -1 && maxAmplitude >= RX_AMPLITUDE_THRESHOLD) {
        // Quadratic interpolation to estimate the true peak frequency
        let mag0 = RX_dataArray[peakIndex - 1] || RX_dataArray[peakIndex];
        let mag1 = RX_dataArray[peakIndex];
        let mag2 = RX_dataArray[peakIndex + 1] || RX_dataArray[peakIndex];

        // Convert dB magnitudes to linear scale
        mag0 = Math.pow(10, mag0 / 20);
        mag1 = Math.pow(10, mag1 / 20);
        mag2 = Math.pow(10, mag2 / 20);

        // Calculate the interpolation factor
        const numerator = mag0 - mag2;
        const denominator = 2 * (mag0 - 2 * mag1 + mag2);
        let delta = 0;
        if (denominator !== 0) {
            delta = numerator / denominator;
        }

        // Estimate the peak frequency
        const interpolatedIndex = peakIndex + delta;
        const peakFrequency = interpolatedIndex * binWidth;

        // Pass the estimated frequency and amplitude to RX_detectTone
        RX_detectTone(peakFrequency, mag1);
    }

    // Continue processing
    setTimeout(RX_processMicrophoneInput, RX_ANALYSIS_INTERVAL); // Use setTimeout for adjustable interval
}



// Modify RX_detectTone to capture and store timestamp and frequency data
function RX_detectTone(frequency, amplitude) {
    const timestamp = Date.now();

    if (!RX_receivedMinCalibrationTone) {
        if (Math.abs(frequency - RX_CALIBRATION_TONE_MIN) <= 5) {
            RX_receivedMinCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency }); // Log timestamp and frequency
            addToLog(`Received min calibration tone: ${frequency} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (Math.abs(frequency - RX_CALIBRATION_TONE_MAX) <= 5) {
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
                // Process the collected frequencies for the header
              //  console.log(RX_receivedFrequencies)
                processCollectedFrequencies(RX_receivedFrequencies, "HEADER");
            }, RX_HEADER_TONE_DURATION*30*2);
            setTimeout(() => {
                RX_collectingFrequencies = false;
                // Process the collected frequencies for the header
              //  console.log(RX_receivedFrequencies)
                processCollectedFrequencies(RX_receivedFrequencies, "ALL");
            }, RX_INTERVAL *60*1000);
        }
    } else if (RX_collectingFrequencies) {
        // Adjust frequency using calibration offset
        const adjustedFreq = Math.round(frequency * 1000) / 1000; //- RX_calibrationOffset;
        // Find the closest expected frequency or map to 0 if outside range
        const snappedFrequency = snapToClosestFrequency(adjustedFreq);
        // Push to RX_receivedFrequencies
        RX_receivedFrequencies.push({ frequency: snappedFrequency, rawfreq: adjustedFreq, timestamp });
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
    const threshold = 2; // Threshold to consider frequency as valid
    let closestFrequency = RX_EXPECTED_FREQUENCIES.reduce((closest, curr) =>
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
    );
    if (Math.abs(closestFrequency - frequency) > threshold) {
        errorCount++;
        return 0; // Return 0 for silence or unexpected frequency
    }
    return closestFrequency;
}

// Process collected frequencies to decode header and image data
function processCollectedFrequencies(data,type) {

    const frequencies = data.map(item => item.frequency);
    console.log(frequencies);
    const result = [];
    let currentGroup = [];
    let lastFrequency = null;

    for (let i = 0; i < frequencies.length; i++) {
        const freq = frequencies[i];

        // Check for spacer tone or frequency change
        if ((freq === 950 || freq === 1150) || (lastFrequency !== null && freq !== lastFrequency)) {
            // If currentGroup has 3 or more consecutive frequencies, push it to result
            if (currentGroup.length >= RX_REQUIRED_SAMPLES_PER_TONE) {
                result.push(currentGroup[0]);
            }
            // Reset currentGroup for new frequency, skipping spacer tones
            currentGroup = (freq === 950 || freq === 1150) ? [] : [freq];
        } else {
            currentGroup.push(freq);
        }

        lastFrequency = freq;
    }

    // Check if the last group is valid and add it if so
    if (currentGroup.length >= RX_REQUIRED_SAMPLES_PER_TONE) {
        result.push(currentGroup[0]);
    }
    // Remove any 0 elements from the result array
    const filteredResult = result.filter(value => value !== 0);
    console.log(filteredResult);
    if (type === "HEADER") {
        const first15Elements = filteredResult.slice(0, 15)
        
        // Convert each element to a character using findClosestChar and build a string
    let decodedString = '';
    for (const frequency of first15Elements) {
        const char = findClosestChar(frequency);
        if (char !== null) {
            decodedString += char;
        }
    }
    RX_validateHeader(decodedString)
    console.log('Decoded String:', decodedString);
    }
    // Save the transmission
   // RX_saveTransmission();
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
        addToLog(`Invalid mode in header: "${mode.trim()}" (Expected "32C" or "4T")`);
        mode = '32C'; // Default to 32C
        errorCount++;
    }

    // Update the spans with the header data
    document.getElementById('image-type').innerText = mode.trim();
    document.getElementById('sender-callsign').innerText = senderCallsign.trim();
    document.getElementById('recipient-callsign').innerText = recipientCallsign.trim();

    RX_headerData = { sender: senderCallsign.trim(), recipient: recipientCallsign.trim(), type: mode.trim() };
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);

    addToLog('Header validated successfully.');
    RX_headerReceived = true;
}


// Function to find the closest character based on frequency
function findClosestChar(frequency) {
    const threshold = 2; // Threshold to consider frequency as valid
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
    const intervalMs = RX_INTERVAL * 60 * 1000;

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


function saveFrequenciesToFile() {
    // Prepare the data to be saved
    const dataToSave = {
        timestamp: new Date().toISOString(),
        frequencies: RX_receivedFrequencies
    };

    // Convert the data to a JSON string
    const jsonString = JSON.stringify(dataToSave, null, 2);

    // Create a Blob from the JSON string
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create a link element
    const link = document.createElement('a');

    // Set the download attribute with a filename
    link.download = `frequencies_${Date.now()}.json`;

    // Create an object URL and set it as the href of the link
    link.href = window.URL.createObjectURL(blob);

    // Append the link to the document body
    document.body.appendChild(link);

    // Trigger the click event to start the download
    link.click();

    // Clean up by removing the link and revoking the object URL
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);

    addToLog(`Frequencies saved to JSON file.`);
}


RX_startListening();
