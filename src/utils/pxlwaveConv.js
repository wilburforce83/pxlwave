// pxlwaveConv.js

// Define the color palette as an array
const colorPalette = [
    "#000000", "#00021c", "#1c284d", "#343473", "#732866", "#2d5280", "#993649", "#d9214f",
    "#a6216e", "#4d7a99", "#d94c87", "#7497a6", "#b36159", "#f25565", "#f28d85", "#f27961",
    "#b38f24", "#b3b324", "#17735f", "#119955", "#2469b3", "#1ba683", "#67b31b", "#a3ccd9",
    "#47cca9", "#96e3c9", "#f09c60", "#f0bb90", "#b3ccd9", "#f7c93e", "#f0edd8", "#0bafe6"
];


// Function to convert an image to grid data
function convertToGridData(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 32, 32);

    const imageData = ctx.getImageData(0, 0, 32, 32);
    const data = imageData.data;

    let gridData = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const colorIndex = getClosestColorIndex(r, g, b);
        gridData.push(colorIndex);
    }
console.log(gridData,colorPalette);
    return gridData;
}

// Function to map RGB values to the closest palette index
function getClosestColorIndex(r, g, b) {
    let minDistance = Infinity;
    let closestIndex = 0;
    for (let i = 0; i < colorPalette.length; i++) {
        const paletteColor = hexToRgb(colorPalette[i]);
        const distance = colorDistance(r, g, b, paletteColor.r, paletteColor.g, paletteColor.b);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }
    return closestIndex;
}

// Helper to calculate distance between two colors
function colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt(
        (r2 - r1) ** 2 +
        (g2 - g1) ** 2 +
        (b2 - b1) ** 2
    );
}

// Convert hex color to RGB
function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

// Function to render grid to canvas
// Function to render grid to canvas
function renderGridToCanvas(canvas, gridData, targetSize, drawGridLines = true) {
    const ctx = canvas.getContext('2d');
    const pixelSize = targetSize / 32; // Calculate pixel size based on target canvas size
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas before rendering

    // Render each pixel color
    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 32; j++) {
            const colorIndex = gridData[i * 32 + j];
            const color = colorPalette[colorIndex];
            ctx.fillStyle = color;
            ctx.fillRect(j * pixelSize, i * pixelSize, pixelSize, pixelSize);
        }
    }

    // Only draw grid overlay if drawGridLines is true
    if (drawGridLines) {
        ctx.strokeStyle = 'rgba(50, 50, 50, 0.35)'; // 1px dark grey grid lines
        for (let x = 0; x <= targetSize; x += pixelSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, targetSize);
        }
        for (let y = 0; y <= targetSize; y += pixelSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(targetSize, y);
        }
        ctx.stroke();
    }
}

// Function to render grid to base64 image
function renderGridToBase64(gridData, targetSize, drawGridLines = true) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext('2d');
    const pixelSize = targetSize / 32; // Assuming grid is 32x32

    // Render each pixel color
    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 32; j++) {
            const colorIndex = gridData[i * 32 + j];
            const color = colorPalette[colorIndex];
            ctx.fillStyle = color;
            ctx.fillRect(j * pixelSize, i * pixelSize, pixelSize, pixelSize);
        }
    }

    // Only draw grid overlay if drawGridLines is true
    if (drawGridLines) {
        ctx.strokeStyle = 'rgba(50, 50, 50, 0.35)'; // 1px dark grey grid lines
        for (let x = 0; x <= targetSize; x += pixelSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, targetSize);
        }
        for (let y = 0; y <= targetSize; y += pixelSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(targetSize, y);
        }
        ctx.stroke();
    }

    // Get the base64 image data
    const base64Image = canvas.toDataURL();

    return base64Image;
}



// Add this function to pxlwaveConv.js

// Function to convert grid data to 4-tone grayscale
function convertToFourTone(gridData) {
    const fourTonePalette = [
        "#000000", // Black
        "#555555", // Dark Gray
        "#AAAAAA", // Light Gray
        "#FFFFFF"  // White
    ];

    return gridData.map(colorIndex => {
        // Convert the colorIndex to a corresponding grayscale tone
        if (colorIndex === 0) return 0; // Black
        if (colorIndex <= 8) return 1; // Dark Gray
        if (colorIndex <= 16) return 2; // Light Gray
        return 3; // White
    });
}

// Make sure to export this function as well
module.exports = {
    colorPalette,
    convertToGridData,
    renderGridToCanvas,
    renderGridToBase64,
    getClosestColorIndex,
    colorDistance,
    hexToRgb,
    convertToFourTone, // Exporting the new function
};
