const { ipcRenderer } = require('electron');
const rarityThresholds = { excellent: 90, good: 70, average: 50 }; // Adjustable quality thresholds
const rarityColors = {
    excellent: '#FFD700', // Gold for high quality
    good: '#C0C0C0',      // Silver for medium quality
    average: '#CD7F32',   // Bronze for lower quality
    poor: '#B22222'       // Red for low quality
};



function openModal(card) {
    document.getElementById('modal').style.display = 'block';
    const modalCanvas = document.getElementById('modal-image');
    renderGridToCanvas(modalCanvas, card.gridData, 256); // Render grid data at a larger size for the modal

    const cardInfo = document.getElementById('card-info');
    cardInfo.innerHTML = `
        <p>Sender: ${card.sender || "No data"}</p>
        <p>Recipient: ${card.recipient || "No data"}</p>
        <p>Quality: ${card.quality || "No data"}</p>
        <p>Type: ${card.type || "No data"}</p>
        <p>Location: ${card.qrzGrid || "No data"}</p>
    `;
}



// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {

    const collectionsGrid = document.getElementById('collections-grid');

ipcRenderer.invoke('load-collection').then(collection => {
    console.log('ipcRenderer Invoked');
    collection.forEach(card => {
        console.log('for each triggered!')
        const quality = card.quality || 0;
        const rarity =
            quality >= rarityThresholds.excellent ? 'excellent' :
            quality >= rarityThresholds.good ? 'good' :
            quality >= rarityThresholds.average ? 'average' : 'poor';

        const cardElement = document.createElement('div');
        cardElement.classList.add('card');
        cardElement.style.backgroundColor = rarityColors[rarity];

        // Canvas for grid data rendering
        const cardCanvas = document.createElement('canvas');
        cardCanvas.width = 128;
        cardCanvas.height = 128;
        renderGridToCanvas(cardCanvas, card.gridData, 128); // Render grid data onto canvas

        const cardInfo = document.createElement('div');
        cardInfo.classList.add('card-info');
        cardInfo.innerHTML = `
            <p>Sender: ${card.sender || "No data"}</p>
            <p>Recipient: ${card.recipient || "No data"}</p>
            <p>Quality: ${quality}</p>
            <p>Type: ${card.type || "No data"}</p>
            <p>Location: ${card.qrzGrid || "No data"}</p>
        `;

        cardElement.appendChild(cardCanvas); // Add canvas to card
        cardElement.appendChild(cardInfo);

        cardElement.addEventListener('click', () => openModal(card));

        collectionsGrid.appendChild(cardElement);
    });
});

    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });


});
