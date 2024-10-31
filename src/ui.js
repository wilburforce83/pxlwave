const { ipcRenderer } = require('electron');

function addToLog(message, type = 'rx', callsign = '') {
    const log = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();

    // Create log item
    const logItem = document.createElement('li');
    logItem.classList.add(type === 'rx' ? 'log-rx' : 'log-tx'); // Apply RX or TX class

    // Create timestamp
    const timeElem = document.createElement('span');
    timeElem.classList.add('timestamp');
    timeElem.textContent = `[${timestamp}]`;

    // Create callsign link if callsign is provided and longer than 3 characters
    let messageElem;
    if (callsign && callsign.length > 3) {
        messageElem = document.createElement('a');
        messageElem.href = `https://www.qrz.com/db/${callsign}`;
        messageElem.target = '_blank';
        messageElem.textContent = callsign;
        messageElem.classList.add('callsign-link');
    } else {
        messageElem = document.createElement('span');
        messageElem.textContent = callsign || message;
    }

    // Append timestamp, message, and additional text if needed
    logItem.appendChild(timeElem);
    logItem.appendChild(messageElem);

    // Append custom message if only RX/TX data without callsign
    if (!callsign) {
      //  const messageText = document.createTextNode(` - ${message}`);
       // logItem.appendChild(messageText);
    }

 log.prepend(logItem);
}

// Example Usage
//addToLog("Image decoded successfully", "rx", "CALL123");
//addToLog("Transmission started", "tx", "MYCALL");
//addToLog("General message without callsign", "rx");

// Display image in RX main display (scaled to 256x256)
function displayImage(imageSrc) {
    const receivedImage = document.getElementById('received-image');
    receivedImage.src = imageSrc;
    receivedImage.style.display = 'block';
}

// Populate header information
function populateHeaderInfo(imageType, sender, recipient) {
    document.getElementById('image-type').textContent = imageType;
    document.getElementById('sender-callsign').textContent = sender;
    document.getElementById('recipient-callsign').textContent = recipient;
    addToLog(`pxlwave found: ${imageType}, ${sender}, ${recipient}`);
}

// Simulate receiving an image and header information
function receiveImageSimulated() {
    const exampleImage = '../public/assets/example.png';
    const imageType = "16 Colors";
    const sender = "CALL123";
    const recipient = "M7WDS";

    populateHeaderInfo(imageType, sender, recipient);
    displayImage(exampleImage);
    addToLog(`${sender} - image decoded`);
}

document.addEventListener("DOMContentLoaded", () => {
    // Example of an event listener on the decode button
    const decodeButton = document.getElementById('decode-button');
    if (decodeButton) {
        decodeButton.addEventListener('click', () => {
            // Your decoding logic here
            
            console.log("Decoding started");
            receiveImageSimulated();
        });
    } else {
        console.error("Decode button not found in DOM");
    }

    // Other DOM manipulation code goes here
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



