const { ipcRenderer } = require('electron');
let canvas;

// Initialize Fabric.js Canvas and set up drawing tools
function initializeCanvas() {
    canvas = new fabric.Canvas('card-canvas', {
        backgroundColor: '#ffffff',
    });

    // Set default drawing mode and color
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush.color = '#000000';
    canvas.freeDrawingBrush.width = 5;
}

// Send card design data to main process for saving
function saveCardDesign() {
    const imageData = canvas.toDataURL({ format: 'png' }).replace(/^data:image\/png;base64,/, '');
    const metadata = {
        callsign: document.getElementById('callsign-input').value,
        version: document.getElementById('version-input').value || 'v1',
    };
    ipcRenderer.send('save-card-design', imageData, metadata);
}

// Initialize color picker, brush, and eraser functionality
document.addEventListener('DOMContentLoaded', () => {
    initializeCanvas();

    // Color Picker
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('change', (event) => {
        canvas.freeDrawingBrush.color = event.target.value;
    });

    // Brush Tool
    document.getElementById('brush-tool').addEventListener('click', () => {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.color = colorPicker.value;
        canvas.freeDrawingBrush.width = 5;
    });

    // Eraser Tool
    document.getElementById('eraser-tool').addEventListener('click', () => {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.color = '#ffffff'; // Erase with the canvas background color
        canvas.freeDrawingBrush.width = 10;
    });

    // Clear Canvas
    document.getElementById('clear-canvas').addEventListener('click', () => {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
    });

    // Save Button
    document.getElementById('save-button').addEventListener('click', saveCardDesign);
});
