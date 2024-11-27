console.log('ui.js loaded');


let audioContext, analyser, dataArray, waveformCanvas, waveformContext, waterfallCanvas, waterfallContext;
let waterfallSpeed = 2;
let amplitudeIntensity = 100;
let currentGridData = [];
let originalGridData = [];
let currentStream; // To keep track of the current audio stream
let isDrawingWaterfall = false; // Flag to control the waterfall animation

// Elements for TX and RX tags
const txTag = document.getElementById('tx-tag');
const rxTag = document.getElementById('rx-tag');

// Setup audio visualization with waterfall and waveform
async function setupAudioVisualization() {
    try {
        // Stop the current stream if it exists
        if (currentStream) {
            const tracks = currentStream.getTracks();
            tracks.forEach(track => track.stop());
        }

        // Close the current AudioContext if it exists
        if (audioContext) {
            audioContext.close();
        }

        // Create a new AudioContext and setup analyser
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192; // Increased FFT size for better resolution
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Get the selected recording device
        const deviceId = document.getElementById('recording-device').value;
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId } }
        });
        currentStream = stream; // Save the stream for later cleanup
        await RX_startMicrophoneStream(deviceId); // restart microphone stream after device change.

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        waterfallCanvas = document.getElementById('waterfall');
        waterfallContext = waterfallCanvas.getContext('2d');

        // Set up the slider controls
        setupControlSliders();

        // Stop any existing waterfall animation

        // Start the waterfall display
        drawWaterfall();
    } catch (error) {
        console.error("Error setting up audio visualization:", error);
    }
}


// Function to set up event listeners for waterfall controls
function setupControlSliders() {
    // Waterfall speed control
    const speedControl = document.getElementById('speed-control');
    speedControl.addEventListener('input', (event) => {
        waterfallSpeed = parseInt(event.target.value);
    });

    // Amplitude color mapping control
    const amplitudeControl = document.getElementById('amplitude-control');
    amplitudeControl.addEventListener('input', (event) => {
        amplitudeIntensity = parseInt(event.target.value);
    });
}

function drawWaterfall() {
    if (isDrawingWaterfall) return; // Prevent multiple loops
    isDrawingWaterfall = true;

    function animate() {
        if (!isDrawingWaterfall) return; // Stop the loop if the flag is false

        setTimeout(() => requestAnimationFrame(animate), 100 / waterfallSpeed);
        analyser.getByteFrequencyData(dataArray);

        // Draw previous waterfall image, shifted down by one pixel
        waterfallContext.drawImage(waterfallCanvas, 0, 1);

        // Calculate the range of frequency bins that correspond to 900-1300 Hz
        const nyquist = audioContext.sampleRate / 2;
        const lowBin = Math.floor((MIN_TONE_FREQ / nyquist) * analyser.frequencyBinCount);
        const highBin = Math.ceil(((MIN_TONE_FREQ + BANDWIDTH) / nyquist) * analyser.frequencyBinCount);

        // Number of bins in the selected range
        const numBins = highBin - lowBin + 1;
        const barWidth = waterfallCanvas.width / numBins;

        // Draw the bars for the frequency range 900-1300 Hz
        for (let i = lowBin; i <= highBin; i++) {
            const value = dataArray[i];
            const percent = value / 255;

            // Use a constant hue for green (120), adjust brightness and saturation
            const hue = 120;
            const saturation = 100;
            const brightness = (percent * amplitudeIntensity * 0.5) + (100 - amplitudeIntensity);

            const x = (i - lowBin) * barWidth;
            waterfallContext.fillStyle = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            waterfallContext.fillRect(x, 0, barWidth, 1);
        }

        // Calculate amplitude in dB
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        const amplitudeDb = 20 * Math.log10(average / 255);
        // Update the amplitude overlay with the calculated dB
       // document.getElementById('amplitude-overlay').textContent = `${amplitudeDb.toFixed(1)} dB`; // comment out to turn off overlay
    }

    animate(); // Start the animation
}



// Transmit button click handler with countdown and TX tag
document.getElementById('transmit-button').addEventListener('click', async (event) => {
    event.preventDefault();

    const fromCallsign = document.getElementById('from-callsign').value;
    const toCallsign = document.getElementById('to-callsign').value;
    const mode = document.querySelector('select[name="mode"]').value;


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

// Add log entries to the log area, with new entries at the top
function addToLog(message, type = 'rx', callsign = '') {
    const log = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const logItem = document.createElement('li');
    logItem.classList.add(`log-${type}`);

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

        recordingSelect.addEventListener('change', async () => {
            RX_stopListening(); // restart the listening processes on change
            await setupAudioVisualization(); // Restart audio visualization when the device changes
            
        });
        playbackSelect.addEventListener('change', () => {
            ipcRenderer.send('set-playback-device', playbackSelect.value);
            playbackSelect.addEventListener('change', async function() {
                selectedOutputDeviceId = playbackSelect.value;
                if (txAudioElement && typeof txAudioElement.setSinkId !== 'undefined') {
                    try {
                        await txAudioElement.setSinkId(selectedOutputDeviceId);
                        console.log('Audio output device set to ' + selectedOutputDeviceId);
                    } catch (err) {
                        console.error('Error setting audio output device: ', err);
                    }
                } else {
                    console.warn('Audio element or setSinkId is not available.');
                }
            });
            console.log('Playback device change;',playbackSelect.value);
        });

        // Initialize the audio visualization with the default device
        await setupAudioVisualization();
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
        const preferences = await ipcRenderer.invoke('load-preferences');
        document.getElementById('from-callsign').value = preferences.callsign;
    }
}

// Display live UTC time in the footer
function displayUtcTime() {
    const utcTimeElement = document.getElementById('utc-time');
    setInterval(() => {
        const now = new Date();
        const utcTime = now.toUTCString().split(' ')[4];
        utcTimeElement.textContent = `UTC Time: ${utcTime}`;
    }, 1000);
}


// Function to show saved cards in the modal for selection
function showCardModal() {
    const modal = document.getElementById('card-modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = ''; // Clear previous content

    // Load cards from saved storage
    ipcRenderer.invoke('load-cards').then((savedCards) => {
        savedCards.forEach((card, index) => {
            const cardCanvas = document.createElement('canvas');
            cardCanvas.width = 64;
            cardCanvas.height = 64;
            cardCanvas.style.margin = '10px';
            cardCanvas.style.cursor = 'pointer';

            renderGridToCanvas(cardCanvas, card.gridData, 64); // Render each saved card to canvas

            // On click, update the main grid image
            cardCanvas.addEventListener('click', () => {
                const imageGridCanvas = document.getElementById('image-preview');
                renderGridToCanvas(imageGridCanvas, card.gridData, 128, false);
                currentGridData = card.gridData.slice(); // Update current grid data
                modal.style.display = 'none'; // Close modal after selection
            });

            modalContent.appendChild(cardCanvas); // Add to modal content
        });
    });

    // Show modal
    modal.style.display = 'flex';
}



// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    displayUtcTime(); // Show UTC time
    loadAudioDevices(); // Load the audio devices
    loadFirstCard(); // Load the first saved card

    // Event listener for closing the modal
    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('card-modal').style.display = 'none';
    });

    // Event listener for showing modal on image-grid click
    document.getElementById('image-grid').addEventListener('click', showCardModal);


    const modeSelect = document.querySelector('select[name="mode"]');
    modeSelect.addEventListener('change', (event) => {
        if (event.target.value === "4T") {
            currentGridData = convertToFourTone(originalGridData);
            renderGridToCanvas(document.getElementById('image-preview'), currentGridData, 128, false);
        } else {
            currentGridData = originalGridData;
            renderGridToCanvas(document.getElementById('image-preview'), currentGridData, 128, false);
        }
    });

    // Add a click event listener to the button
    document.getElementById('clearlog-button').addEventListener('click', function () {
        // Clear the contents of the element with ID 'log'
        document.getElementById('log').innerHTML = '';
    });
});
