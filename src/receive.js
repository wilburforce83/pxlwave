// receive.js

// set up variables
let RX_headerReceived = false;
let RX_imagaStarted = false;
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
let RX_audioContext, RX_analyser, RX_microphoneStream, RX_dataArray, RX_bufferLength;
let RX_collectingFrequencies = false;
let countdown = 5;
let RX_now = false;

// generate array of all expected frequencies
const RX_EXPECTED_FREQUENCIES = [
    CALIBRATION_TONE_MIN,
    CALIBRATION_TONE_MAX,
    END_OF_LINE,
    ...Object.values(CHAR_FREQ_MAP)
];

// set up worker.js to offload RX_processMicrophoneInput();
const worker = new Worker('../src/worker.js');

worker.onmessage = function(event) {
    const { detectedFrequency, magnitude } = event.data;
  //  console.log(detectedFrequency,magnitude, RX_EXPECTED_FREQUENCIES);
    if (detectedFrequency && magnitude > RX_AMPLITUDE_THRESHOLD) {
        RX_detectTone(detectedFrequency, magnitude);
    }
};




async function RX_startMicrophoneStream() {


    try {
        // Initialize Audio Context
        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Request access to the microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);
        
        // Create a Band-Pass Filter to isolate expected frequencies
        const bandPass = RX_audioContext.createBiquadFilter();
        bandPass.type = 'bandpass';
        bandPass.frequency.value = (MIN_TONE_FREQ + MAX_TONE_FREQ) / 2; // Center frequency
        bandPass.Q.value = (MAX_TONE_FREQ - MIN_TONE_FREQ) / (MIN_TONE_FREQ * 2); // Quality factor

        let lastNode = bandPass; // Track the last node for connection

        if (RX_COMPRESSOR_STATE) {
            // Create a Dynamics Compressor for basic noise suppression
            const compressor = RX_audioContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(RX_COMPRESSOR_THRESH, RX_audioContext.currentTime); // Adjust as needed
            compressor.knee.setValueAtTime(40, RX_audioContext.currentTime);
            compressor.ratio.setValueAtTime(12, RX_audioContext.currentTime);
            compressor.attack.setValueAtTime(0, RX_audioContext.currentTime);
            compressor.release.setValueAtTime(0.25, RX_audioContext.currentTime);

            // Connect Band-Pass Filter -> Compressor
            bandPass.connect(compressor);
            lastNode = compressor; // Update the last node to the compressor
        }

        // Set up the Analyser Node with increased FFT size for better frequency resolution
        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = FFT_SIZE;
        RX_bufferLength = RX_analyser.frequencyBinCount;
        RX_dataArray = new Float32Array(RX_bufferLength);

        // Connect the last node to the analyser
        lastNode.connect(RX_analyser);

        // Start processing the microphone input
        RX_processMicrophoneInput();
    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}


function RX_processMicrophoneInput() {
    // Capture time domain data
    const startTime = performance.now();
    RX_analyser.getFloatTimeDomainData(RX_dataArray);
    const maxAmplitude = Math.max(...RX_dataArray);
    if (maxAmplitude < RX_AMPLITUDE_THRESHOLD) {
        // Skip processing if the signal is too weak
       console.log("signal too weak, max amplitude:",maxAmplitude);
        setTimeout(RX_processMicrophoneInput, RX_ANALYSIS_INTERVAL);
        return;
    }
    const samples = Array.from(RX_dataArray);
    
    // Apply Hamming Window
    const windowedSamples = applyHammingWindow(samples);
    
    // Send data to Web Worker for processing
    worker.postMessage({
        samples: windowedSamples,
        sampleRate: RX_audioContext.sampleRate,
        expectedFrequencies: RX_EXPECTED_FREQUENCIES,
        calibrationOffset: RX_calibrationOffset,
        amplitudeThreshold: RX_AMPLITUDE_THRESHOLD
    });

    const endTime = performance.now();
    const processingTime = endTime - startTime;
  // console.log(`Processing Time: ${processingTime.toFixed(2)} ms`);
    // Continue processing at defined intervals
    setTimeout(RX_processMicrophoneInput, RX_ANALYSIS_INTERVAL);
}

function applyHammingWindow(samples) {
    const N = samples.length;
    return samples.map((sample, n) => sample * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1))));
}


function RX_detectTone(frequency, amplitude) {
    const timestamp = Date.now();

    if (!RX_receivedMinCalibrationTone) {
        if (Math.abs(frequency - CALIBRATION_TONE_MIN) <= RX_CALIBRATION_DRIFT) {
            RX_receivedMinCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency });
            addToLog(`Received min calibration tone: ${frequency.toFixed(2)} Hz`);
        }
    } else if (!RX_receivedMaxCalibrationTone) {
        if (Math.abs(frequency - CALIBRATION_TONE_MAX) <= RX_CALIBRATION_DRIFT) {
            RX_receivedMaxCalibrationTone = frequency;
            RX_toneDataLog.push({ timestamp, frequency });
            addToLog(`Received max calibration tone: ${frequency.toFixed(2)} Hz (sync point)`);
            RX_calculateCalibrationOffset();
            RX_collectingFrequencies = true;

            // Schedule processing of header and all frequencies
            setTimeout(() => processCollectedFrequencies(RX_receivedFrequencies, "HEADER"), HEADER_TONE_DURATION * 30 * 2);
            setTimeout(() => processCollectedFrequencies(RX_receivedFrequencies, "ALL"), (TONE_DURATION * 64) + 5000);
        }
    } else if (RX_collectingFrequencies) {
        // Adjust frequency with calibration offset
        const adjustedFreq = frequency - RX_calibrationOffset;
        const snappedFrequency = snapToClosestFrequency(adjustedFreq);

        if (snappedFrequency !== 0) { // Ignore invalid or out-of-threshold frequencies
            RX_receivedFrequencies.push(snappedFrequency);
            RX_toneDataLog.push({ timestamp, frequency, snappedFrequency });
          //  console.log(`Collected frequency: ${snappedFrequency}`);
        } else {
           // console.warn(`Frequency out of range or invalid: ${frequency.toFixed(2)} Hz`);
        }
    }
}

function snapToClosestFrequency(frequency) {
    const threshold = RX_CALIBRATION_DRIFT;
    let closestFrequency = RX_EXPECTED_FREQUENCIES.reduce((closest, curr) =>
        Math.abs(curr - frequency) < Math.abs(closest - frequency) ? curr : closest
    , RX_EXPECTED_FREQUENCIES[0]);

    if (Math.abs(closestFrequency - frequency) > threshold) {
        if (Math.abs(END_OF_LINE - frequency) <= threshold) {
            return "EOL"; // Correctly identify EOL within threshold
        } else {
            errorCount++;
            return 0; // Return 0 for silence or unexpected frequency
        }
    }

    return closestFrequency === END_OF_LINE ? "EOL" : closestFrequency;
}



function processCollectedFrequencies(data, type) {
    data = dropRogueTones(data);
    data = filterFrequencies(data);
    console.log('Process Collected Frequencies Tiggered', type, data);
    RX_processedFrequencies = [];
    let currentGroup = [];
    let lastFrequency = null;

    for (let i = 0; i < data.length; i++) {
        const freq = data[i];
        if ((freq === CALIBRATION_TONE_MIN || freq === CALIBRATION_TONE_MAX) || (lastFrequency !== null && freq !== lastFrequency)) {
            if (currentGroup.length >= RX_REQUIRED_SAMPLES_PER_TONE) {
                RX_processedFrequencies.push(currentGroup[0]);
            }
            currentGroup = (freq === CALIBRATION_TONE_MIN || freq === CALIBRATION_TONE_MAX) ? [] : [freq];
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
        setTimeout(() => RX_startImageDecoding(RX_headerData.type), TONE_DURATION * 64 + TONE_DURATION);
    }
    console.log("RX_processedFrequencies length;", RX_processedFrequencies.length)

}

function RX_startImageDecoding(mode) {
    const decodetoneMap = mode === '4T' ? _4T_TONE_MAP : _32C_TONE_MAP;
    let toneIndex = 14;
    const gridSize = 32;
    let currentLine = [];


    const intervalId = setInterval(() => {
        // Check if the toneIndex is within bounds
        /*
        if (toneIndex >= RX_processedFrequencies.length) {
            // If we're out of frequencies, log and exit the interval until more data arrives
            console.log(`Waiting for more frequencies... toneIndex=${toneIndex}, processedFreqs=${RX_processedFrequencies.length}`);
            setTimeout(() => processCollectedFrequencies(RX_receivedFrequencies, "ALL"), 5000);
            return;
        }
            */

        if (toneIndex > (gridSize * gridSize) + (gridSize * 2)) {
            // Finish decoding if all frequencies processed
            if (currentLine.length > 0 && currentLine.length < gridSize) {
                fillMissingTones(currentLine, gridSize, decodetoneMap);
            }
            RX_collectingFrequencies = false;
            addToLog(`toneIndex higher than processed frequency length: TI=${toneIndex}, PF = ${RX_processedFrequencies.length}`);
            RX_saveTransmission();
            clearInterval(intervalId);
            return;
        }

        /*
        if (toneIndex < RX_processedFrequencies.length) {
            
*/
const currentFreq = RX_processedFrequencies[toneIndex];
            if (currentFreq === "EOL") {
                // Render the completed line
                if (currentLine.length < gridSize) {
                    fillMissingTones(currentLine, gridSize, decodetoneMap);
                }
                renderLine(currentLine);
                currentLine = [];
                RX_lineCount++;
                toneIndex++;
                return;
            }

            currentLine.push(currentFreq);
            toneIndex++;

        //}
    }, TONE_DURATION * 3);

    function fillMissingTones(line, targetLength, decodetoneMap) {
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
            const colorIndex = decodetoneMap.findIndex(tone => Math.abs(tone - freq) < 2);
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
    RX_headerData = { sender: senderCallsign, recipient: recipientCallsign, type: mode };
    addToLog(`Header received: Type=${RX_headerData.type}, Sender=${RX_headerData.sender}, To=${RX_headerData.recipient}`);
    RX_headerReceived = true;
    getCallsignMeta(senderCallsign)
        .then(qrzData => {
            if (qrzData) {
                // Process the QRZ data
            } else {
                // Handle the case where QRZ data is not available
                console.log('No QRZ data retrieved.');
            }
        })
        .catch(error => {

            console.error('Unhandled error:', error);
        });


}

function RX_calculateCalibrationOffset() {
    RX_calibrationOffset = ((RX_receivedMinCalibrationTone + RX_receivedMaxCalibrationTone) / 2) - ((CALIBRATION_TONE_MIN + CALIBRATION_TONE_MAX) / 2);
    addToLog(`Calculated calibration offset: ${RX_calibrationOffset} Hz`);
}

function findClosestChar(frequency) {
    const threshold = RX_CALIBRATION_DRIFT;
    let closestChar = null;
    let minDiff = Infinity;
    for (const [char, freq] of Object.entries(CHAR_FREQ_MAP)) {
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
        quality: 95, // needs a calculation to determine real "quality"
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
    resetDataAfterRX()
    RX_startListening()


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
    const nextInterval = new Date(epoch.getTime() + Math.ceil(timeSinceEpoch / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(RX_startTime);
    nextInterval.setUTCMilliseconds(0);

    const timeUntilNextListen = nextInterval.getTime() - now.getTime();
    startRXCountdown(timeUntilNextListen);

    setTimeout(() => {
        if (!TX_Active) {
            resetDataAfterRX()
            toggleRxTag(true);
            RX_now = true;
            addToLog('Listening for tones...');
            RX_startMicrophoneStream();

            RX_listeningTimeout = setTimeout(() => {
                if (!RX_headerReceived) {
                    console.log('timed out')
                    toggleRxTag(false);
                    RX_now = false;
                    resetDataAfterRX()
                    if (RX_microphoneStream) RX_microphoneStream.disconnect();
                    if (RX_audioContext) RX_audioContext.close();
                }
                RX_startListening();    
            }, 15000);
        }
    }, timeUntilNextListen);

    setTimeout(RX_startListening, intervalMs);
}

function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}


function resetDataAfterRX() {
    // reset all variables:
    RX_headerReceived = false;
    RX_imagaStarted = false;
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
    console.log('data reset for next RX');
}

RX_startListening();







// HELPER FUNCTIONS

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
