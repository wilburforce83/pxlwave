const { ipcRenderer } = require('electron');

let cardData;

function LoadContacts() {
    ipcRenderer.invoke('load-contact')
        .then(result => {
            // Handle the result here
           // console.log('Save result:', result);
           cardData = result;
        })
        .catch(error => {
            // Handle any errors here
            console.error('Error saving card:', error);
        });
}

LoadContacts();


function createCard(contact) {
    const cardTilt = document.createElement('div');
    cardTilt.className = 'card-tilt';

    const cardInner = `
        <div class="card">
          <div class="card-face card-front">
            <div class="image-container">
              <img src="${contact.cardImage || 'assets/cardParts/test-image.PNG'}" alt="Image" />
              <div class="imgsheen"></div>
            </div>
            <div class="sheen"></div>
            <div id="callsign" class="callsign">${contact.callsign}</div>
            <div id="distance" class="distance">Distance: ${contact.distanceKM} km</div>
            <div id="location" class="location">${contact.addr2 || 'Unknown Location'}, ${contact.country || 'Unknown Country'}</div>
            <div id="name" class="name">${contact.name || 'Unknown Name'}</div>
            <div id="quality" class="quality">Quality Score: ${contact.grading.qualityScore}/100</div>
            <div id="snr" class="snr">SNR Score: ${contact.snr}/100</div>
            <div id="dxscore" class="dxscore">DX Score: ${contact.grading.distanceScore}/100</div>
            <div class="qso-container">
                <img src="assets/cardParts/QSO.png" alt="Image" />
                <div class="imgsheen"></div>
            </div>
          </div>
          <div class="card-face card-back">
            <div class="sheen"></div>
          </div>
        </div>
    `;

    cardTilt.innerHTML = cardInner;
    addCardInteractions(cardTilt); // Add the sheen and animation effects

    return cardTilt;
}

function addCardInteractions(cardTilt) {
    const card = cardTilt.querySelector(".card");
    const sheens = card.querySelectorAll(".sheen");
    const sheensImg = card.querySelectorAll(".imgsheen");

    let isFlipped = false;

    cardTilt.addEventListener("mousemove", (e) => {
        if (cardTilt.classList.contains("animating")) {
            return; // Disable tilt during animation
        }
        const rect = cardTilt.getBoundingClientRect();
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

        sheens.forEach((sheen) => {
            sheen.style.setProperty("--mouse-x", `${xPercent}%`);
            sheen.style.setProperty("--mouse-y", `${yPercent}%`);
            sheen.style.setProperty("--sheen-opacity", "0.1");
        });

        sheensImg.forEach((sheen) => {
            sheen.style.setProperty("--mouse-x", `${xPercent}%`);
            sheen.style.setProperty("--mouse-y", `${yPercent}%`);
            sheen.style.setProperty("--sheen-opacity", "0.1");
        });

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((e.clientY - rect.top - centerY) / centerY) * 10;
        const rotateY = ((e.clientX - rect.left - centerX) / centerX) * -10;

        cardTilt.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${
            isFlipped ? 2.5 : 1
        })`;
    });

    cardTilt.addEventListener("mouseleave", () => {
        if (cardTilt.classList.contains("animating")) {
            return; // Disable during animation
        }
        cardTilt.style.transform = `rotateX(0deg) rotateY(0deg) scale(${
            isFlipped ? 2.5 : 1
        })`;
        sheens.forEach((sheen) => {
            sheen.style.setProperty("--sheen-opacity", "0");
        });
        sheensImg.forEach((sheen) => {
            sheen.style.setProperty("--sheen-opacity", "0");
        });
    });

    cardTilt.addEventListener("click", () => {
        if (!cardTilt.classList.contains("animating")) {
            if (!isFlipped) {
                cardTilt.classList.add("animating", "animate");
            } else {
                cardTilt.classList.add("animating", "animate-back");
            }

            // Toggle the isFlipped state after the animation ends
            cardTilt.addEventListener(
                "animationend",
                () => {
                    cardTilt.classList.remove("animating", "animate", "animate-back");
                    isFlipped = !isFlipped;
                    // Set the transform to the final state
                    cardTilt.style.transform = `rotateX(0deg) rotateY(0deg) scale(${
                        isFlipped ? 2.5 : 1
                    })`;
                },
                { once: true }
            );
        }
    });
}

function renderCards() {
    const cardContainer = document.querySelector(".card-container");
    cardContainer.innerHTML = ''; // Clear any existing cards

    cardData.forEach(contact => {
        const cardElement = createCard(contact);
        cardContainer.appendChild(cardElement);
    });
}

// Add search functionality as before
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

// Call these functions to initialize the card rendering and search
document.addEventListener('DOMContentLoaded', () => {
    LoadContacts(); // Load cardData initially

    setTimeout(() => { // Adding a delay to make sure cardData is loaded, replace with event handling if needed
        renderCards();
        addSearchFunctionality();
    }, 500);
});
