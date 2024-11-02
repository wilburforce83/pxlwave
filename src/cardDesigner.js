const { ipcRenderer } = require('electron');

// Send card design data to main process for saving
function saveCardDesign(imageData, metadata) {
    ipcRenderer.send('save-card-design', imageData, metadata);
}

// Listen for UI events from the Fabric.js canvas and trigger save when needed
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('save-button').addEventListener('click', () => {
        // Generate image data from Fabric.js canvas here
        const canvas = document.getElementById('card-canvas');
        const imageData = canvas.toDataURL().replace(/^data:image\/png;base64,/, '');
        const metadata = {
            callsign: document.getElementById('callsign-input').value,
            version: document.getElementById('version-input').value || 'v1',
        };
        saveCardDesign(imageData, metadata);
    });
});
