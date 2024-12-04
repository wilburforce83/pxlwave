const { ipcRenderer } = require('electron');

let cardData;

function LoadContacts() {
    ipcRenderer.invoke('load-contact')
        .then(result => {
            cardData = result;
            renderCards();
        })
        .catch(error => {
            console.error('Error loading contacts:', error);
        });
}

function renderCards() {
    const gridContainer = document.getElementById('card-grid');
    gridContainer.innerHTML = ''; // Clear existing content

    cardData.forEach(contact => {
        // Conditionally include the qso-container based on contact.qso
        const qsoContainerHTML = contact.qso ? `
            <div class="qso-container">
                <img src="assets/cardParts/QSO.png" alt="QSO Image" />
                <div class="imgsheen"></div>
            </div>
        ` : '';

        const cardHTML = `
            <div class="card-card-container">  
             <div class="card-container">  
                <div class="card">
                    <div class="card-face card-front">
                        <div class="image-container">
                            <img src="${contact.image || 'assets/cardParts/test-image.PNG'}" alt="Image" />
                            <div class="imgsheen"></div>
                        </div>
                        <div class="sheen"></div>
                        <div class="callsign">${contact.callsign}</div>
                        <div class="distance">Distance: ${contact.distanceKM} km</div>
                        <div class="location">${contact.addr2 || 'Unknown Location'}, ${contact.country || 'Unknown Country'}</div>
                        <div class="name">${contact.name || 'Unknown Name'}</div>
                        <div class="quality">Quality Score: ${contact.grading.qualityScore}/100</div>
                        <div class="snr">SNR Score: ${contact.snr}/100</div>
                        <div class="dxscore">DX Score: ${contact.grading.distanceScore}/100</div>
                        ${qsoContainerHTML}
                    </div>
                    <div class="card-face card-back">
                        <div class="sheen"></div>
                        <!-- Back face content can go here -->
                    </div>
                </div>
            </div>
            </div>
        `;

        // Create a wrapper div and set its innerHTML
        const cardElement = document.createElement('div');
        cardElement.innerHTML = cardHTML;

        // Append the card to the grid container
        gridContainer.appendChild(cardElement.firstElementChild);
    });
}

function addSearchFunctionality() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredData = cardData.filter(contact => 
            contact.callsign.toLowerCase().includes(searchTerm) ||
            (contact.name && contact.name.toLowerCase().includes(searchTerm)) ||
            (contact.addr2 && contact.addr2.toLowerCase().includes(searchTerm)) ||
            (contact.country && contact.country.toLowerCase().includes(searchTerm))
        );
        renderFilteredCards(filteredData);
    });
}

function renderFilteredCards(filteredData) {
    const cardContainer = document.querySelector(".card-container");
    cardContainer.innerHTML = ''; // Clear existing cards

    filteredData.forEach(contact => {
        const cardElement = createCard(contact);
        cardContainer.appendChild(cardElement);
    });
}


// Load contacts when the window loads
window.onload = LoadContacts;
