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

// New function to load the first saved card and set callsign
async function loadFirstCard() {
    const savedCards = await ipcRenderer.invoke('load-cards');
    if (savedCards.length > 0) {
        const firstCard = savedCards[0];
        const imageCanvas = document.getElementById('image-preview');
        const ctx = imageCanvas.getContext('2d');
        
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
        // Assuming we have a way to determine the grayscale equivalent
        const color = colorPalette[colorIndex];
        const rgb = hexToRgb(color);
        const grayValue = Math.round((rgb.r + rgb.g + rgb.b) / 3);

        // Return the index of the closest tone
        if (grayValue < 64) return 0; // Black
        else if (grayValue < 128) return 1; // Dark Gray
        else if (grayValue < 192) return 2; // Light Gray
        else return 3; // White
    });
}

// Event listener for the radio buttons
document.addEventListener('DOMContentLoaded', () => {
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === "4-gray") {
                // Convert and render the 4-tone image
                currentGridData = convertToFourTone(originalGridData);
                renderGridToCanvas(document.getElementById('image-preview'), currentGridData, 128, false); // no grid lines will be drawn
            } else {
                // Render the original color image
                currentGridData = originalGridData;
                renderGridToCanvas(document.getElementById('image-preview'), currentGridData, 128, false); // no grid lines will be drawn
            }
        });
    });

    loadAudioDevices(); // Load devices after DOM is fully loaded
    loadFirstCard(); // Load the first saved card when the application starts
});

document.addEventListener('DOMContentLoaded', async () => {
    // Existing code...

    const imagePreview = document.getElementById('image-preview');
    const cardModal = document.getElementById('card-modal');
    const modalContent = document.getElementById('modal-content');

    // Function to load saved cards
    async function loadSavedCards() {
        const savedCards = await ipcRenderer.invoke('load-cards');
        // Render each saved card in the modal
        modalContent.innerHTML = ''; // Clear previous contents
        savedCards.forEach((card) => {
            const cardDiv = document.createElement('div');
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;

            renderGridToCanvas(canvas, card.gridData, 128, false); // Render without grid lines

            cardDiv.classList.add('modal-card');
            cardDiv.appendChild(canvas);
            cardDiv.addEventListener('click', () => {
                renderGridToCanvas(imagePreview, card.gridData, 128, false); // Render selected card
                document.getElementById('from-callsign').value = card.callsign; // Set the callsign
                cardModal.style.display = 'none'; // Hide modal after selection
                // Store the original grid data
        originalGridData = card.gridData.slice(); // Clone the original color data
        currentGridData = card.gridData; // Store currentGridData for use
            });
            modalContent.appendChild(cardDiv);
        });
    }

    // Show modal when the image preview is clicked
    imagePreview.addEventListener('click', () => {
        cardModal.style.display = 'flex'; // Show modal
        loadSavedCards(); // Load saved cards into the modal
    });

    // Close modal when the close button is clicked
    document.getElementById('modal-close').addEventListener('click', () => {
        cardModal.style.display = 'none'; // Hide modal
    });

    // Hide modal if clicked outside
    cardModal.addEventListener('click', (event) => {
        if (event.target === cardModal) {
            cardModal.style.display = 'none'; // Hide modal
        }
    });

    // Load the first card when the application starts
    loadFirstCard(); // Assuming this function already exists
});

document.addEventListener("DOMContentLoaded", () => {
// Call setupAudioVisualization when the decode button is clicked
document.getElementById('decode-button').addEventListener('click', () => {
    setupAudioVisualization();
    console.log("Waterfall display started.");
});

document.getElementById('transmit-button').addEventListener('click', async () => {
    const fromCallsign = document.getElementById('from-callsign').value;
    const toCallsign = document.getElementById('to-callsign').value;
    const mode = document.querySelector('input[name="mode"]:checked').value;

    if (!fromCallsign || !toCallsign) {
        alert("Both callsigns must be provided!");
        return;
    }

    // Ensure grid data (image data) is available
    if (currentGridData.length === 0) {
        alert("No image data available for transmission.");
        return;
    }

    // Send the transmission data via IPC to the transmit process
    ipcRenderer.send('start-transmission', currentGridData, fromCallsign, toCallsign, mode);

    // Add transmission log message
    addToLog(`Transmission started to ${toCallsign}`, "tx", fromCallsign);
});


});

