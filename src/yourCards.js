const { ipcRenderer } = require('electron');

// Define the color palette as an array
const colorPalette = [
    "#000000", "#00021c", "#1c284d", "#343473", "#2d5280", "#4d7a99", "#7497a6", "#a3ccd9",
    "#f0edd8", "#732866", "#a6216e", "#d94c87", "#d9214f", "#f25565", "#f27961", "#993649",
    "#b36159", "#f09c60", "#b38f24", "#b3b324", "#f7c93e", "#17735f", "#119955", "#67b31b",
    "#1ba683", "#47cca9", "#96e3c9", "#2469b3", "#0b8be6", "#0bafe6", "#f28d85", "#f0bb90"
];

document.addEventListener('DOMContentLoaded', async () => {
    const selectFileButton = document.getElementById('select-file-button');
    const imagePreview = document.getElementById('image-preview');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressBarText = document.getElementById('progress-bar-text');
    const saveButton = document.getElementById('save-button');
    const existingImagesContainer = document.getElementById('existing-images');

    let currentGridData = [];

    // Load saved cards on startup
    await loadSavedCards();

    // Handle file selection
    selectFileButton.addEventListener('click', async () => {
        const filePath = await ipcRenderer.invoke('select-file');
        if (filePath) {
            progressBarText.style.visibility = 'visible';
            progressBarText.textContent = "Converting to Pxlwave...";
            loadImage(filePath);
        }
    });

    // Function to load saved cards from the database
    async function loadSavedCards() {
        const savedCards = await ipcRenderer.invoke('load-cards');
        const gallery = document.getElementById('existing-images');
        gallery.innerHTML = ''; // Clear the gallery

        if (savedCards.length === 0) {
            gallery.innerHTML = '<p>No images saved yet.</p>';
            return;
        }

        savedCards.forEach((card, index) => {
            const cardDiv = document.createElement('div');
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            cardDiv.classList.add('image-card');
            cardDiv.appendChild(canvas);

            renderGalleryImage(canvas, card.gridData); // Render the saved image

            cardDiv.addEventListener('click', () => openModal(card, index, savedCards));
            gallery.appendChild(cardDiv);
            
        });
    }

    function renderGridToCanvas(canvas, gridData, targetSize) {
        const ctx = canvas.getContext('2d');
        const pixelSize = targetSize / 32; // Calculate pixel size based on target canvas size (128 or 512)
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas before rendering
console.log(gridData,colorPalette);
        // Render each pixel color
        for (let i = 0; i < 32; i++) {
            for (let j = 0; j < 32; j++) {
                const colorIndex = gridData[i * 32 + j];
                const color = colorPalette[colorIndex];
                ctx.fillStyle = color;
                ctx.fillRect(j * pixelSize, i * pixelSize, pixelSize, pixelSize);
            }
        }

        // Draw grid overlay (1px dark grey lines)
        ctx.strokeStyle = 'rgba(50, 50, 50, 0.8)'; // 1px dark grey grid lines
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

    // Usage for gallery images (128x128)
    function renderGalleryImage(canvas, gridData) {
        renderGridToCanvas(canvas, gridData, 128); // Render with 128x128 canvas size
    }

    // Usage for modal images (512x512)
    function renderModalImage(canvas, gridData) {
        renderGridToCanvas(canvas, gridData, 512); // Render with 512x512 canvas size
    }

    // Function to open modal with full-size image and navigation
    function openModal(card, currentIndex, savedCards) {
        const modal = document.getElementById('image-modal');
        const modalCanvas = document.getElementById('modal-canvas');
        const modalCallsign = document.getElementById('modal-callsign');
        const modalDescription = document.getElementById('modal-description');
        const deleteImageButton = document.getElementById('delete-image-button');

        function updateModal(card) {
            renderModalImage(modalCanvas, card.gridData); // Render modal image
            modalCallsign.innerText = `Callsign: ${card.callsign}`;
            modalDescription.innerText = `Description: ${card.description}`;
        }

        updateModal(card);

        // Navigation handlers
        document.getElementById('prev-image').onclick = () => {
            currentIndex = (currentIndex === 0) ? savedCards.length - 1 : currentIndex - 1;
            updateModal(savedCards[currentIndex]);
        };
        document.getElementById('next-image').onclick = () => {
            currentIndex = (currentIndex === savedCards.length - 1) ? 0 : currentIndex + 1;
            updateModal(savedCards[currentIndex]);
        };

      // Deletion handler
deleteImageButton.onclick = async () => {
    if (confirm("Are you sure you want to delete this image?")) {
        const cardId = savedCards[currentIndex].id; // Use the card's unique ID to identify it
        const result = await ipcRenderer.invoke('delete-card', cardId); // Pass the card ID to the delete handler
        console.log(result); // Log the result
        modal.style.display = 'none';
        loadSavedCards(); // Reload saved cards after deletion
    }
};


        // Close modal
        document.getElementById('modal-close').onclick = () => {
            modal.style.display = 'none';
        };

        modal.style.display = 'flex'; // Show modal
    }

    function loadImage(filePath) {
        const img = new Image();
        img.src = filePath;
        img.onload = () => {
            const ctx = imagePreview.getContext('2d');
            ctx.clearRect(0, 0, imagePreview.width, imagePreview.height);
            ctx.drawImage(img, 0, 0, 256, 256);

            convertToGridData(img);
        };
    }

    function convertToGridData(img) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 32, 32);

        const imageData = ctx.getImageData(0, 0, 32, 32);
        const data = imageData.data;

        currentGridData = [];
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const colorIndex = getClosestColorIndex(r, g, b);
            currentGridData.push(colorIndex);
        }

        renderGrid(currentGridData);
        updateProgressBar(currentGridData.length, 1024);
    }

    function renderGrid(gridData) {
        const ctx = imagePreview.getContext('2d');
        const gridSize = 8;
        for (let i = 0; i < 32; i++) {
            for (let j = 0; j < 32; j++) {
                const colorIndex = gridData[i * 32 + j];
                const color = colorPalette[colorIndex];
                ctx.fillStyle = color;
                ctx.fillRect(j * gridSize, i * gridSize, gridSize, gridSize);
            }
        }

        ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
        for (let x = 0; x <= 256; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 256);
        }
        for (let y = 0; y <= 256; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(256, y);
        }
        ctx.stroke();
    }

    function updateProgressBar(completed, total) {
        const percent = (completed / total) * 100;
        progressBarFill.style.width = percent + "%";
        if (percent < 100) {
            progressBarText.textContent = "Converting to Pxlwave...";
        } else {
            progressBarText.textContent = "Completed!";
        }
    }

    saveButton.addEventListener('click', async () => {
        const cardData = {
            id: Date.now(),
            gridData: currentGridData,
            callsign: document.getElementById('callsign').value,
            description: document.getElementById('description').value
        };

        const result = await ipcRenderer.invoke('save-card', cardData);
        console.log(result); // Log the result of saving
        loadSavedCards(); // Reload the gallery
    });

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

    function colorDistance(r1, g1, b1, r2, g2, b2) {
        return Math.sqrt(
            (r2 - r1) ** 2 +
            (g2 - g1) ** 2 +
            (b2 - b1) ** 2
        );
    }

    function hexToRgb(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255
        };
    }

    function convertToGrayscale(gridData) {
        return gridData.map(colorIndex => {
            const color = colorPalette[colorIndex];
            const rgb = hexToRgb(color);
            const grayValue = Math.round((rgb.r + rgb.g + rgb.b) / 3);
            return colorPalette.indexOf(`#${grayValue.toString(16).padStart(2, '0').repeat(3)}`); // Assuming a grayscale palette is built in advance
        });
    }
    
});
