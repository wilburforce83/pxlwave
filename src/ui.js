const { ipcRenderer } = require('electron');

let audioContext, analyser, dataArray, waveformCanvas, waveformContext, waterfallCanvas, waterfallContext;
let waterfallSpeed = 5; // Default waterfall speed
let amplitudeIntensity = 50; // Default amplitude intensity

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
    setTimeout(() => requestAnimationFrame(drawWaterfall), 100 / waterfallSpeed); // Control speed

    analyser.getByteFrequencyData(dataArray);

    waterfallContext.drawImage(waterfallCanvas, 0, 1);

    const barWidth = waterfallCanvas.width / dataArray.length;

    for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const hue = Math.round((1 - percent) * 240);
        const brightness = (percent * amplitudeIntensity) + (100 - amplitudeIntensity); // Adjust brightness with slider

        waterfallContext.fillStyle = `hsl(${hue}, 100%, ${brightness}%)`;
        waterfallContext.fillRect(i * barWidth, 0, barWidth, 1);
    }
}

function addToLog(message, type = 'rx', callsign = '') {
    const log = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();

    const logItem = document.createElement('li');
    logItem.classList.add(type === 'rx' ? 'log-rx' : 'log-tx'); // Apply RX or TX class

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
        messageContainer.textContent = callsign || message;
    }

    logItem.appendChild(timeElem);
    logItem.appendChild(messageContainer);
    log.prepend(logItem);
}

// Log when populating header information
function populateHeaderInfo(imageType, sender, recipient) {
    document.getElementById('image-type').textContent = imageType;
    document.getElementById('sender-callsign').textContent = sender;
    document.getElementById('recipient-callsign').textContent = recipient;
    addToLog(`Image type: ${imageType}`, "rx", sender);
}

// Simulate receiving an image and logging details
function receiveImageSimulated() {
    const exampleImage = '../public/assets/example.png';
    const imageType = "16 Colors";
    const sender = "CALL123";
    const recipient = "M7WDS";

    populateHeaderInfo(imageType, sender, recipient);
    displayImage(exampleImage);
    addToLog(`Image decoded`, "rx", sender);
}

function displayImage(imageSrc) {
    const receivedImage = document.getElementById('received-image');
    if (receivedImage) {
        receivedImage.src = imageSrc;
        receivedImage.style.display = 'block';
    } else {
        console.error("Received image element not found in DOM.");
    }
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

    } catch (error) {
        console.error('Error loading audio devices:', error);
    }
}

// Event listener for the decode button and sliders
document.addEventListener("DOMContentLoaded", () => {
    const decodeButton = document.getElementById('decode-button');
    if (decodeButton) {
        decodeButton.addEventListener('click', () => {
            setupAudioVisualization();
            console.log("Waterfall display started.");
            console.log("Decoding started");
            receiveImageSimulated();
        });
    } else {
        console.error("Decode button not found in DOM");
    }

    document.getElementById('speed-control').addEventListener('input', (event) => {
        waterfallSpeed = parseInt(event.target.value, 10);
    });

    document.getElementById('amplitude-control').addEventListener('input', (event) => {
        amplitudeIntensity = parseInt(event.target.value, 10);
    });

    loadAudioDevices(); // Load devices after DOM is fully loaded
});
