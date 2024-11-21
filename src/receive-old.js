//receive.js

// receive.js - Refactored

let RX_state = {
    headerReceived: false,
    imageStarted: false,
    currentPixel: 0,
    gridData: new Array(1024).fill(0),
    headerData: {},
    errorCount: 0,
    receivedFrequencies: [],
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

// Constants
const RX_EXPECTED_FREQUENCIES = [
    CALIBRATION_TONE_MIN,
    CALIBRATION_TONE_MAX,
    ...Object.values(CHAR_FREQ_MAP),
    ..._32C_TONE_MAP,
];

// Initialize Web Worker
RX_worker = new Worker('../src/RX_worker.js');
RX_worker.onmessage = (event) => {
    const { detectedFrequency, magnitude } = event.data;
    if (detectedFrequency && magnitude > RX_AMPLITUDE_THRESHOLD) {
      //  console.log(`Freq:${detectedFrequency}amplitude accepted ${magnitude} trigger: ${RX_AMPLITUDE_THRESHOLD}`);
        processDetectedTone(detectedFrequency);
    } else {
       // console.log(`Freq:${detectedFrequency}amplitude too low ${magnitude} trigger: ${RX_AMPLITUDE_THRESHOLD}`);
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
        if (RX_microphoneStream) {
            const tracks = RX_microphoneStream.mediaStream.getTracks();
            tracks.forEach((track) => track.stop());
        }
        if (RX_audioContext) {
            RX_audioContext.close();
        }

        RX_audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const constraints = deviceId
            ? { audio: { deviceId: { exact: deviceId } } }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        RX_microphoneStream = RX_audioContext.createMediaStreamSource(stream);

        RX_analyser = RX_audioContext.createAnalyser();
        RX_analyser.fftSize = FFT_SIZE;
        RX_dataArray = new Float32Array(RX_analyser.frequencyBinCount);

        RX_microphoneStream.connect(RX_analyser);

        RX_addToLog('Microphone stream initialized.');
        RX_startListening();
    } catch (error) {
        console.error('Error initializing microphone stream:', error);
        RX_addToLog('Failed to initialize microphone stream.');
    }
}


// Start RX process
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
            resetRXState();
            toggleRxTag(true);
            RX_isListening = true;
            RX_addToLog('Listening for tones...');
            processMicrophoneInput();

            RX_listeningTimeout = setTimeout(() => {
                if (!RX_state.headerReceived) {
                    console.log('Timed out');
                    toggleRxTag(false);
                    RX_stopListening()
                    resetRXState();
                    RX_startListening();
                }
            }, 15000); // Adjust timeout duration as needed
        }
    }, timeUntilNextListen);
}


// Stop RX process
function RX_stopListening() {
    RX_isListening = false;
    if (RX_audioContext) RX_audioContext.suspend();
    clearTimeout(RX_listeningTimeout);
    RX_addToLog('Stopped listening.');
}

// Process microphone input
function processMicrophoneInput() {
    if (!RX_isListening) return;

    RX_analyser.getFloatTimeDomainData(RX_dataArray);
   // console.log("RX_dataArray (first 10):", RX_dataArray.slice(0, 10));
    const samples = Array.from(RX_dataArray);
    const windowedSamples = applyHammingWindow(samples);

    // Log the samples and other parameters
  //  console.log("Samples (first 10):", windowedSamples.slice(0, 10));
  //  console.log("Sample Rate:", RX_audioContext.sampleRate);
  //  console.log("Expected Frequencies:", RX_EXPECTED_FREQUENCIES);
  //  console.log("Calibration Offset:", RX_state.calibration.offset);

    RX_worker.postMessage({
        samples: windowedSamples,
        sampleRate: RX_audioContext.sampleRate,
        expectedFrequencies: RX_EXPECTED_FREQUENCIES,
        calibrationOffset: RX_state.calibration.offset,
        amplitudeThreshold: RX_AMPLITUDE_THRESHOLD,
    });

    setTimeout(processMicrophoneInput, PROCESSING_INTERVAL);
}


async function populateAudioDevices() {
    const deviceSelect = document.getElementById('playback-device');
    deviceSelect.innerHTML = ''; // Clear existing options

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');

        audioInputs.forEach((device) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${device.deviceId}`;
            deviceSelect.appendChild(option);
        });

        RX_addToLog('Audio devices loaded.');
    } catch (error) {
        console.error('Error loading audio devices:', error);
        RX_addToLog('Failed to load audio devices.');
    }
}


// Process detected tone
function processDetectedTone(frequency) {
    if (!RX_state.calibration.minTone) {
        if (Math.abs(frequency - CALIBRATION_TONE_MIN) <= RX_CALIBRATION_DRIFT) {
            RX_state.calibration.minTone = frequency;
            RX_addToLog(`Min calibration tone detected: ${frequency} Hz`);
        }
    } else if (!RX_state.calibration.maxTone) {
        if (Math.abs(frequency - CALIBRATION_TONE_MAX) <= RX_CALIBRATION_DRIFT) {
            RX_state.calibration.maxTone = frequency;
            calculateCalibrationOffset();
            RX_addToLog(`Max calibration tone detected: ${frequency} Hz`);
        }
    } else if (!RX_state.headerReceived) {
        RX_state.receivedFrequencies.push(frequency);
        if (RX_state.receivedFrequencies.length >= HEADER_TONES_EXPECTED) {
            decodeHeader();
        }
    } else if (RX_state.imageStarted) {
        RX_state.receivedFrequencies.push(frequency);
        if (RX_state.receivedFrequencies.length >= GRID_TONES_EXPECTED) {
            decodeGridData();
        }
    }
}

// Calculate calibration offset
function calculateCalibrationOffset() {
    const { minTone, maxTone } = RX_state.calibration;
    RX_state.calibration.offset = 0// (minTone + maxTone) / 2 - CALIBRATION_TONE_MIN;
    RX_addToLog(`Calibration offset calculated: ${RX_state.calibration.offset} Hz`);
}

// Decode header
function decodeHeader() {
    RX_state.headerReceived = true;
    const headerData = processHeaderTones(RX_state.receivedFrequencies);
    RX_state.headerData = headerData;

    // Log the decoded header
    RX_addToLog(`Header decoded: Type=${headerData.mode}, Sender=${headerData.sender}, To=${headerData.recipient}`);
}


// Decode grid data
function decodeGridData() {
    RX_state.imageStarted = true;
    const gridData = processGridTones(RX_state.receivedFrequencies);
    RX_state.gridData = gridData;
    RX_addToLog('Image decoding complete.');
    saveDecodedImage();
}

// Save decoded image
function saveDecodedImage() {
    const imageData = {
        timestamp: new Date().toISOString(),
        header: RX_state.headerData,
        gridData: RX_state.gridData,
    };
    // Save to storage or collection
    RX_addToLog('Image saved successfully.');
    resetRXState();
}

// Reset RX state
function resetRXState() {
    RX_state = {
        headerReceived: false,
        imageStarted: false,
        currentPixel: 0,
        gridData: new Array(1024).fill(0),
        headerData: {},
        errorCount: 0,
        receivedFrequencies: [],
        toneLog: [],
        calibration: { minTone: null, maxTone: null, offset: 0 },
    };
}

// Utility functions
function applyHammingWindow(samples) {
    const N = samples.length;
    return samples.map((sample, n) =>
        sample * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1)))
    );
}

function RX_addToLog(message) {
    const log = document.getElementById('log');
    if (log) {
        log.value += `[${new Date().toISOString()}] ${message}\n`;
        log.scrollTop = log.scrollHeight;
    } else {
        console.log(`[LOG] ${message}`);
    }
}


function processHeaderTones(receivedFrequencies) {
    const groupedFrequencies = [];
    const repetitions = FEC ? 3 : 1;

    // Group tones based on repetitions
    for (let i = 0; i < receivedFrequencies.length; i += repetitions) {
        const group = receivedFrequencies.slice(i, i + repetitions);
        groupedFrequencies.push(group);
    }

    // Perform majority voting for each group
    const decodedFrequencies = groupedFrequencies.map((group) => {
        return majorityVote(group);
    });

    // Map decoded frequencies to characters
    const decodedHeader = decodedFrequencies.map((freq) => {
        const char = getKeyByValue(CHAR_FREQ_MAP, freq);
        return char || '?'; // Use '?' for unknown frequencies
    }).join('');

    return parseHeaderString(decodedHeader);
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

function parseHeaderString(headerString) {
    const headerParts = headerString.trim().split('-');
    if (headerParts.length !== 3) {
        RX_addToLog(`Header format error: Expected 2 hyphens but found ${headerParts.length - 1}.`);
        RX_state.errorCount++;
        return { sender: 'Unknown', recipient: 'Unknown', mode: '32C' };
    }

    const [senderCallsign, recipientCallsign, mode] = headerParts;
    if (mode !== '32C' && mode !== '4T') {
        RX_addToLog(`Invalid mode in header: ${mode}. Defaulting to 32C.`);
        RX_state.errorCount++;
        return { sender: senderCallsign, recipient: recipientCallsign, mode: '32C' };
    }

    return { sender: senderCallsign, recipient: recipientCallsign, mode };
}

document.getElementById('recording-device').addEventListener('change', async (event) => {
    const selectedDeviceId = event.target.value;
    RX_addToLog(`Selected audio device: ${selectedDeviceId}`);
    await restartMicrophoneStream(selectedDeviceId);
});

async function restartMicrophoneStream(deviceId = null) {
    try {
        // Stop the current microphone stream
        if (RX_microphoneStream) {
            const tracks = RX_microphoneStream.mediaStream.getTracks();
            tracks.forEach((track) => track.stop());
        }
        if (RX_audioContext) {
            RX_audioContext.close();
        }

        // Restart with the new device or default device
        await RX_startMicrophoneStream(deviceId);
        RX_addToLog('Microphone stream restarted successfully.');
    } catch (error) {
        console.error('Error restarting microphone stream:', error);
        RX_addToLog('Failed to restart microphone stream.');
    }
}



function toggleRxTag(active) {
    rxTag.classList.toggle('tag-inactive', !active);
    rxTag.classList.toggle('tag-rx', active);
}



// Add log entries to the log area, with new entries at the top
function RX_addToLog(message, type = 'rx', callsign = '') {
    const log = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const logItem = document.createElement('li');
    logItem.classList.add(type === 'rx' ? 'log-rx' : 'log-tx');

    const timeElem = document.createElement('span');
    timeElem.classList.add('timestamp');
    timeElem.textContent = `[${timestamp}] `;

    const messageContainer = document.createElement('span');
    if (callsign && callsign.length > 3) {
        const callsignLink = document.createElement('a');
        callsignLink.href = `https://www.qrz.com/db/${callsign}`;
        callsignLink.target = '_blank';
        callsignLink.textContent = callsign;
        callsignLink.classList.add('callsign-link');
        messageContainer.appendChild(callsignLink);
        messageContainer.append(` - ${message}`);
    } else {
        messageContainer.textContent = message;
    }

    logItem.appendChild(timeElem);
    logItem.appendChild(messageContainer);

    // Insert the new log item at the top of the log
    log.insertBefore(logItem, log.firstChild);
}


// Start microphone stream on page load
(async () => {
    await populateAudioDevices();
    await RX_startMicrophoneStream(); // Start with the default device
})();

