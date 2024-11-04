console.log('ui.js loaded')
const { ipcRenderer } = require('electron');

let audioContext, analyser, dataArray, waveformCanvas, waveformContext, waterfallCanvas, waterfallContext;
let waterfallSpeed = 5; // Default waterfall speed
let amplitudeIntensity = 50; // Default amplitude intensity
let currentGridData = []; // Current grid data in color
let originalGridData = []; // Store the original color data

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
    logItem.classList.add(type === 'rx' ? 'log-rx' : 'log-tx'); // RX for received logs, TX for transmit logs

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

    log.appendChild(logItem); // Append each log at the bottom

    log.scrollTop = log.scrollHeight; // Auto-scroll to the latest log entry
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

// New function to load the first saved card and set callsign
async function loadFirstCard() {
    const savedCards = await ipcRenderer.invoke('load-cards');
    if (savedCards.length > 0) {
        const firstCard = savedCards[0];
        const imageCanvas = document.getElementById('image-preview');

        // Render the first saved card
        renderGridToCanvas(imageCanvas, firstCard.gridData, 128, false); // no grid lines will be drawn

        // Store the original grid data
        originalGridData = firstCard.gridData.slice(); // Clone the original color data
        currentGridData = firstCard.gridData; // Store currentGridData for use

        // Set the from callsign field
        document.getElementById('from-callsign').value = firstCard.callsign;
    }
}

// Function to convert color grid data to 4-tone
function convertToFourTone(gridData) {
    const fourTonePalette = [
        "#000000", // Black
        "#555555", // Dark Gray
        "#AAAAAA", // Light Gray
        "#FFFFFF"  // White
    ];

    return gridData.map(colorIndex => {
        const color = colorPalette[colorIndex];
        const rgb = hexToRgb(color);
        const grayValue = Math.round((rgb.r + rgb.g + rgb.b) / 3);

        if (grayValue < 64) return 0; // Black
        else if (grayValue < 128) return 1; // Dark Gray
        else if (grayValue < 192) return 2; // Light Gray
        else return 3; // White
    });
}

// Consolidate everything into one 'DOMContentLoaded' listener
document.addEventListener('DOMContentLoaded', async () => {
    // Set up mode selection for image
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

    // Load audio devices and the first card
    loadAudioDevices();
    loadFirstCard();

    // Handle the decode button
    document.getElementById('decode-button').addEventListener('click', () => {
        setupAudioVisualization();
        console.log("Waterfall display started.");
    });

    // Handle the transmit button
    document.getElementById('transmit-button').addEventListener('click', async (event) => {
        event.preventDefault();  // Prevent default form submission behavior

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

        // Disable the button to prevent multiple clicks during one transmission
        const transmitButton = document.getElementById('transmit-button');
        transmitButton.disabled = true;

        // Send the transmission data via IPC to the main process
        ipcRenderer.send('start-transmission', currentGridData, fromCallsign, toCallsign, mode);




        // Add transmission log message
        addToLog(`Transmission booked to ${toCallsign}`, "tx", fromCallsign);
        console.log("transmit button clicked!")

        // Re-enable the button after a short delay (for demo purposes, adjust as needed)
        setTimeout(() => {
            transmitButton.disabled = false;
        }, 2000);  // Set a delay before allowing the button to be clicked again
    });

    // Listen for updates from the main process
    ipcRenderer.on('log-tx', (event, message) => {
        addToLog(message, 'tx', fromCallsign);  // Log the transmission status
    });


    // Modal handling for selecting a card
    const imagePreview = document.getElementById('image-preview');
    const cardModal = document.getElementById('card-modal');
    const modalContent = document.getElementById('modal-content');

    imagePreview.addEventListener('click', () => {
        cardModal.style.display = 'flex';
        loadSavedCards();
    });

    document.getElementById('modal-close').addEventListener('click', () => {
        cardModal.style.display = 'none';
    });

    cardModal.addEventListener('click', (event) => {
        if (event.target === cardModal) {
            cardModal.style.display = 'none';
        }
    });
});



let txAudioContext;
let oscillator;
let gainNode;
const TONE_DURATION = 50; // ms

// Function to generate tones for the transmission
async function transmitTone(frequency, duration) {
    txAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = txAudioContext.createOscillator();
    gainNode = txAudioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, txAudioContext.currentTime); // Set frequency

    oscillator.connect(gainNode);
    gainNode.connect(txAudioContext.destination);
    
    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
    }, duration);
}

// Function to convert image data into tones
function encodeImageToTones(gridData, palette) {
    const tones = [];
    const MIN_TONE_FREQ = 1000;
    const MAX_TONE_FREQ = 1100;
    const BANDWIDTH = MAX_TONE_FREQ - MIN_TONE_FREQ;
    const toneStep = BANDWIDTH / palette.length; // Calculate step size within the 100Hz bandwidth

    gridData.forEach(colorIndex => {
        const toneFreq = MIN_TONE_FREQ + (colorIndex * toneStep); // Map color to a tone within the bandwidth
        tones.push(toneFreq);
    });

    return tones;
}

// Function to start transmission from renderer process
async function startRendererTransmission(gridData, palette) {
    const tones = encodeImageToTones(gridData, palette);
    
    // Transmit each tone
    for (const tone of tones) {
        await transmitTone(tone, TONE_DURATION);
    }

    console.log('Renderer: Transmission complete.');
    ipcRenderer.send('log-tx', `Transmission complete. Sent ${tones.length} tones.`);
}

// Listen for 'start-transmission' event from main process
ipcRenderer.on('start-transmission-renderer', async (event, gridData, palette) => {
    console.log('Renderer: Starting transmission');
    await startRendererTransmission(gridData, palette);
});
