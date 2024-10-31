const { ipcRenderer } = require('electron');


let audioContext, analyser, dataArray, waveformCanvas, waveformContext, waterfallCanvas, waterfallContext;

async function setupAudioVisualization() {
    try {
        // Initialize audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // Smaller FFT size for faster updates
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Get the selected recording device and capture audio
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: document.getElementById('recording-device').value }
            }
        });
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // Setup canvas for waveform and waterfall drawing
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

// Draw the audio waveform on the waveform canvas
function drawWaveform() {
    requestAnimationFrame(drawWaveform);

    // Get time-domain data
    const waveformArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(waveformArray);

    // Clear canvas and draw waveform
    waveformContext.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformContext.beginPath();
    waveformContext.lineWidth = 2;
    waveformContext.strokeStyle = '#32cd32'; // Green for waveform

    const sliceWidth = waveformCanvas.width / waveformArray.length;
    let x = 0;

    for (let i = 0; i < waveformArray.length; i++) {
        const v = waveformArray[i] / 128.0; // Normalize to range 0-2
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

// Draw the waterfall on the waterfall canvas
function drawWaterfall() {
    requestAnimationFrame(drawWaterfall);

    // Get frequency data
    analyser.getByteFrequencyData(dataArray);

    // Shift canvas down to create a scrolling effect
    waterfallContext.drawImage(waterfallCanvas, 0, 1);

    // Calculate width of each frequency bin
    const barWidth = waterfallCanvas.width / dataArray.length;

    // Draw new frequency data at the top
    for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];
        const percent = value / 255; // Normalize amplitude to 0-1 range
        const hue = Math.round((1 - percent) * 240); // Map intensity to color (blue to red)
        const brightness = percent * 100; // Adjust brightness based on amplitude

        // Set color and draw the bar at the calculated position
        waterfallContext.fillStyle = `hsl(${hue}, 100%, ${brightness}%)`;
        waterfallContext.fillRect(i * barWidth, 0, barWidth, 1); // Adjust bar position and width
    }
}




function addToLog(message, type = 'rx', callsign = '') {
    const log = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();

    // Create log item
    const logItem = document.createElement('li');
    logItem.classList.add(type === 'rx' ? 'log-rx' : 'log-tx'); // Apply RX or TX class

    // Create timestamp element
    const timeElem = document.createElement('span');
    timeElem.classList.add('timestamp');
    timeElem.textContent = `[${timestamp}] `;

    // Create message container and callsign link if necessary
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

    // Append timestamp, message container, and other details to log item
    logItem.appendChild(timeElem);
    logItem.appendChild(messageContainer);

    // Add to the top of the log list
    log.prepend(logItem);
}


// Log when populating header information
function populateHeaderInfo(imageType, sender, recipient) {
    document.getElementById('image-type').textContent = imageType;
    document.getElementById('sender-callsign').textContent = sender;
    document.getElementById('recipient-callsign').textContent = recipient;
    addToLog(`Image type: ${imageType}`, "rx", sender); // Log with sender callsign
}

// Simulate receiving an image and logging details
function receiveImageSimulated() {
    const exampleImage = '../public/assets/example.png';
    const imageType = "16 Colors";
    const sender = "CALL123";
    const recipient = "M7WDS";

    populateHeaderInfo(imageType, sender, recipient);
    displayImage(exampleImage);
    addToLog(`Image decoded`, "rx", sender); // Log with sender callsign
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


// Transmit log example usage
function transmitImage() {
    const sender = document.getElementById('from-callsign').value || "YourCall";
    addToLog(`Transmission started`, "tx", sender); // Log with sender callsign for TX
}

// Event listener for the decode button, triggering the simulated receive function
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
});


async function loadAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const recordingSelect = document.getElementById('recording-device');
        const playbackSelect = document.getElementById('playback-device');

        // Clear previous options
        recordingSelect.innerHTML = '';
        playbackSelect.innerHTML = '';

        // Populate recording devices
        devices
            .filter(device => device.kind === 'audioinput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${recordingSelect.length + 1}`;
                recordingSelect.appendChild(option);
            });

        // Populate playback devices
        devices
            .filter(device => device.kind === 'audiooutput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Speaker ${playbackSelect.length + 1}`;
                playbackSelect.appendChild(option);
            });

        // Listen for changes in device selection
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

// Load devices once DOM is fully loaded
document.addEventListener('DOMContentLoaded', loadAudioDevices);



