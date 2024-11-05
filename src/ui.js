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





// Setup audio visualization with waterfall and waveform
async function setupAudioVisualization() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: document.getElementById('recording-device').value } }
        });
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        waveformCanvas = document.getElementById('waveform');
        waveformContext = waveformCanvas.getContext('2d');
        waterfallCanvas = document.getElementById('waterfall');
        waterfallContext = waterfallCanvas.getContext('2d');

        drawWaveform();
        drawWaterfall();
    } catch (error) {
        console.error("Error setting up audio visualization:", error);
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

// Draw the audio waveform
function drawWaveform() {
    requestAnimationFrame(drawWaveform);
    const waveformArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(waveformArray);

    waveformContext.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformContext.beginPath();
    waveformContext.lineWidth = 2;
    waveformContext.strokeStyle = '#32cd32';

    const sliceWidth = waveformCanvas.width / waveformArray.length;
    let x = 0;

    for (let i = 0; i < waveformArray.length; i++) {
        const v = waveformArray[i] / 128.0;
        const y = (v * waveformCanvas.height) / 2;

        if (i === 0) {
            waveformContext.moveTo(x, y);
        } else {
            waveformContext.lineTo(x, y);
        }

        x += sliceWidth;
    }

    waveformContext.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
    waveformContext.stroke();
}

// Draw the waterfall
function drawWaterfall() {
    setTimeout(() => requestAnimationFrame(drawWaterfall), 100 / waterfallSpeed);
    analyser.getByteFrequencyData(dataArray);
    waterfallContext.drawImage(waterfallCanvas, 0, 1);

    const barWidth = waterfallCanvas.width / dataArray.length;
    for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const hue = Math.round((1 - percent) * 240);
        const brightness = (percent * amplitudeIntensity) + (100 - amplitudeIntensity);
        waterfallContext.fillStyle = `hsl(${hue}, 100%, ${brightness}%)`;
        waterfallContext.fillRect(i * barWidth, 0, barWidth, 1);
    }
}

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
