console.log('ui.js loaded');
const { ipcRenderer } = require('electron');
let audioContext, analyser, dataArray, waveformCanvas, waveformContext, waterfallCanvas, waterfallContext;
let waterfallSpeed = 5;
let amplitudeIntensity = 50;
let currentGridData = [];
let originalGridData = [];

// Elements for TX and RX tags
const txTag = document.getElementById('tx-tag');
const rxTag = document.getElementById('rx-tag');





/// Setup audio visualization with waterfall and waveform
async function setupAudioVisualization() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192; // Increased FFT size for better resolution
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: document.getElementById('recording-device').value } }
        });
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        waterfallCanvas = document.getElementById('waterfall');
        waterfallContext = waterfallCanvas.getContext('2d');


        drawWaterfall();
    } catch (error) {
        console.error("Error setting up audio visualization:", error);
    }
}

// Draw the waterfall showing only the 900-1300Hz range with better resolution
function drawWaterfall() {
    setTimeout(() => requestAnimationFrame(drawWaterfall), 100 / waterfallSpeed);
    analyser.getByteFrequencyData(dataArray);

    // Draw previous waterfall image, shifted down by one pixel
    waterfallContext.drawImage(waterfallCanvas, 0, 1);

    // Calculate the range of frequency bins that correspond to 900-1300 Hz
    const nyquist = audioContext.sampleRate / 2; // Nyquist frequency (half the sample rate)
    const lowBin = Math.floor((600 / nyquist) * analyser.frequencyBinCount);
    const highBin = Math.ceil((1800 / nyquist) * analyser.frequencyBinCount);
    
    // Number of bins between 900-1300 Hz
    const numBins = highBin - lowBin + 1;
    const barWidth = waterfallCanvas.width / numBins; // Full canvas width mapped to the selected range

    // Draw the bars for the frequency range 900-1300 Hz
    for (let i = lowBin; i <= highBin; i++) {
        const value = dataArray[i];
        const percent = value / 255; // Normalize the amplitude
        const hue = Math.round((1 - percent) * 240); // Map amplitude to color hue
        const brightness = (percent * amplitudeIntensity) + (100 - amplitudeIntensity);
        
        const x = (i - lowBin) * barWidth; // Calculate x-position for the current bin
        waterfallContext.fillStyle = `hsl(${hue}, 100%, ${brightness}%)`;
        waterfallContext.fillRect(x, 0, barWidth, 1); // Draw the frequency bar
    }
}


// Transmit button click handler with countdown and TX tag
document.getElementById('transmit-button').addEventListener('click', async (event) => {
    event.preventDefault();

    const fromCallsign = document.getElementById('from-callsign').value;
    const toCallsign = document.getElementById('to-callsign').value;
    const mode = document.querySelector('input[name="mode"]:checked').value;

    if (!fromCallsign || !toCallsign) {
        alert("Both callsigns must be provided!");
        return;
    }

    if (currentGridData.length === 0) {
        alert("No image data available for transmission.");
        return;
    }

    // Schedule transmission for the next +7 second mark
    scheduleTransmission(currentGridData, fromCallsign, toCallsign, mode);
});


// Add log entries to the log area
function addToLog(message, type = 'rx', callsign = '') {
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
    log.appendChild(logItem);
    log.scrollTop = log.scrollHeight;
}

// Load available audio devices into dropdowns
async function loadAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const recordingSelect = document.getElementById('recording-device');
        const playbackSelect = document.getElementById('playback-device');

        recordingSelect.innerHTML = '';
        playbackSelect.innerHTML = '';

        devices
            .filter(device => device.kind === 'audioinput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${recordingSelect.length + 1}`;
                recordingSelect.appendChild(option);
            });

        devices
            .filter(device => device.kind === 'audiooutput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Speaker ${playbackSelect.length + 1}`;
                playbackSelect.appendChild(option);
            });

        recordingSelect.addEventListener('change', () => {
            ipcRenderer.send('set-recording-device', recordingSelect.value);
        });
        playbackSelect.addEventListener('change', () => {
            ipcRenderer.send('set-playback-device', playbackSelect.value);
        });

        setupAudioVisualization();
        console.log("Waterfall display started automatically.");
    } catch (error) {
        console.error('Error loading audio devices:', error);
    }
}

// Function to load the first saved card and set callsign
async function loadFirstCard() {
    const savedCards = await ipcRenderer.invoke('load-cards');
    if (savedCards.length > 0) {
        const firstCard = savedCards[0];
        const imageCanvas = document.getElementById('image-preview');
        renderGridToCanvas(imageCanvas, firstCard.gridData, 128, false);
        originalGridData = firstCard.gridData.slice();
        currentGridData = firstCard.gridData;
        document.getElementById('from-callsign').value = firstCard.callsign;
    }
}

// Display live UTC time in the footer
function displayUtcTime() {
    const utcTimeElement = document.getElementById('utc-time');
    setInterval(() => {
        const now = new Date();
        const utcTime = now.toUTCString().split(' ')[4]; // Get HH:MM:SS part
        utcTimeElement.textContent = `UTC Time: ${utcTime}`;
    }, 1000);
}

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    displayUtcTime(); // Show UTC time
    loadAudioDevices(); // Load the audio devices
    loadFirstCard(); // Load the first saved card

    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === "4-gray") {
                currentGridData = convertToFourTone(originalGridData);
                renderGridToCanvas(document.getElementById('image-preview'), currentGridData, 128, false);
            } else {
                currentGridData = originalGridData;
                renderGridToCanvas(document.getElementById('image-preview'), currentGridData, 128, false);
            }
        });
    });

    // Hide the splash screen once the app is ready
    const splashScreen = document.getElementById('splash-screen');
    setTimeout(() => {
        splashScreen.style.display = 'none'; // Hide the splash screen
    }, 5000);
});
