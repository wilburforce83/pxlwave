// Assuming the pxlwaveConv.js file is loaded and its functions are available
const gridData = [
    12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
    12, 12, 13, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    13, 13, 13, 13, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
    12, 12, 13, 20, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    13, 13, 13, 13, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
    12, 13, 12, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    13, 13, 13, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 12,
    12, 13, 12, 12, 15, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    13, 13, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 12, 13,
    13, 12, 12, 12, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    13, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 12, 13, 13,
    12, 12, 13, 12, 13, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    13, 12, 12, 13, 13, 13, 13, 13, 13, 25, 25, 25, 25, 12, 13, 13,
    12, 13, 12, 25, 25, 25, 25, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    12, 12, 13, 13, 13, 13, 13, 13, 25, 25, 25, 25, 12, 13, 12, 12,
    13, 12, 25, 25, 25, 25, 2, 2, 2, 2, 2, 2, 2, 2, 2, 12,
    13, 13, 13, 13, 13, 13, 25, 25, 13, 13, 13, 12, 25, 25, 12, 13,
    25, 25, 13, 13, 2, 2, 25, 25, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 13, 13, 13, 25, 25, 13, 13, 12, 12, 25, 25, 13, 13,
    25, 25, 13, 13, 2, 2, 25, 25, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 13, 13, 13, 25, 25, 13, 12, 13, 12, 12, 13, 13, 12,
    25, 25, 13, 13, 2, 2, 25, 25, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 13, 13, 13, 25, 25, 12, 12, 13, 12, 25, 25, 12, 12,
    25, 25, 13, 13, 25, 25, 2, 2, 2, 2, 2, 2, 2, 20, 2, 13,
    13, 13, 13, 13, 13, 13, 25, 25, 12, 13, 12, 12, 25, 25, 12, 13,
    25, 25, 13, 2, 25, 25, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 13, 13, 13, 12, 12, 25, 25, 25, 25, 13, 12, 13, 13,
    13, 13, 25, 25, 2, 2, 25, 25, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 13, 13, 12, 12, 13, 25, 25, 25, 25, 12, 12, 13, 13,
    13, 13, 25, 25, 2, 2, 25, 25, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 13, 12, 12, 13, 13, 13, 12, 13, 13, 12, 13, 13, 13,
    13, 13, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13,
    13, 13, 13, 12, 12, 13, 13, 12, 12, 13, 13, 12, 13, 13, 13, 13,
    13, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 20, 2, 2, 13,
    13, 13, 13, 12, 13, 13, 13, 12, 12, 13, 12, 12, 13, 13, 13, 13,
    13, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13, 13,
    13, 12, 13, 13, 12, 12, 13, 13, 12, 12, 13, 13, 13, 13, 13, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13, 12,
    12, 13, 13, 12, 12, 13, 13, 12, 12, 13, 13, 13, 13, 13, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 20, 2, 2, 2, 2, 2, 12, 12,
    13, 13, 13, 12, 13, 13, 12, 12, 13, 13, 13, 13, 13, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13, 12, 12,
    13, 13, 12, 12, 13, 13, 12, 12, 13, 13, 13, 13, 13, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13, 12,
    12, 13, 13, 12, 12, 13, 13, 12, 12, 13, 13, 13, 13, 13, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 20, 2, 2, 2, 2, 2, 12, 12,
    13, 13, 13, 12, 13, 13, 12, 12, 13, 13, 13, 13, 13, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 12, 13, 13,
    13, 13, 13, 25, 13, 13, 12, 25, 13, 25, 25, 25, 13, 2, 25, 2,
    2, 2, 25, 2, 25, 25, 25, 2, 2, 2, 25, 25, 25, 2, 2, 2,
    13, 12, 12, 25, 25, 12, 25, 25, 13, 13, 2, 2, 25, 2, 25, 2,
    2, 2, 25, 2, 25, 2, 2, 25, 2, 25, 2, 2, 2, 2, 2, 2,
    12, 12, 13, 25, 12, 25, 13, 25, 2, 13, 2, 2, 25, 2, 25, 2,
    25, 2, 25, 2, 25, 2, 2, 25, 2, 2, 25, 25, 2, 2, 2, 2,
    2, 2, 2, 25, 2, 2, 2, 25, 2, 2, 2, 25, 2, 2, 25, 25,
    2, 25, 25, 2, 25, 2, 2, 25, 2, 2, 2, 2, 25, 2, 2, 2,
    2, 2, 2, 25, 2, 2, 2, 25, 2, 2, 2, 25, 2, 2, 25, 2,
    2, 2, 25, 2, 25, 25, 25, 2, 2, 25, 25, 25, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2
];

const canvas = document.getElementById('splash-canvas');
const progressBar = document.getElementById('progress-bar');
const renderInterval = 5000 / gridData.length; // Interval to render each pixel over 5 seconds

// Function to render the image progressively
function renderImageProgressively(canvas, gridData) {
    const ctx = canvas.getContext('2d');
    const pixelSize = canvas.width / 32; // Each pixel will be 8x8

    let pixelIndex = 0;
    function renderNextPixel() {
        if (pixelIndex >= gridData.length) {
            const welcome = document.getElementById('pxlwave-hello');
            welcome.style.display = 'flex';
          setTimeout(hideSplashScreen,2000);
    
            return; // All pixels have been rendered
        }

        const i = Math.floor(pixelIndex / 32); // Row
        const j = pixelIndex % 32; // Column
        const colorIndex = gridData[pixelIndex];
        const color = colorPalette[colorIndex];

        // Render the pixel on the canvas
        ctx.fillStyle = color;
        ctx.fillRect(j * pixelSize, i * pixelSize, pixelSize, pixelSize);

        // Update progress bar
        const progressPercent = ((pixelIndex + 1) / gridData.length) * 100;
        progressBar.style.width = progressPercent + '%';

        // Move to the next pixel
        pixelIndex++;
        setTimeout(renderNextPixel, renderInterval); // Recursively render the next pixel
    }

    // Start rendering the first pixel
    renderNextPixel();
}

// Start the rendering process
renderImageProgressively(canvas, gridData);

// Hide splash screen after rendering completion
function hideSplashScreen() {
    // Select the splash screen element
const splashScreen = document.getElementById('splash-screen');

// Add the fade-out class to start the transition
splashScreen.classList.add('fade-out');

// Set a timeout to hide the splash screen after the transition finishes
setTimeout(() => {
    splashScreen.style.display = 'none';
}, 500); // Match this duration to the transition duration in CSS (0.5s here)
}
