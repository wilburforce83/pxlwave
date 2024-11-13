// qrzPref const loaded in ui.js ln 193

// qrz connection file
let qrzPref;
let qrz = {};
let qrzUser = '';
let qrzPassword = '';
let tokenURL = '';
let qrzToken = '';

// XML token collection

async function getSessionKey() {

    qrzPref = await ipcRenderer.invoke('load-preferences');
    if (qrzPref.qrzUsername != "") {
        qrzUser = qrzPref.qrzUsername;
        qrzPassword = qrzPref.qrzPassword;
        tokenURL = `https://xmldata.qrz.com/xml/?username=${qrzUser};password=${qrzPassword}`
    } else {
        return "Unable to connect with QRZ without log in credentials";
    }

    try {
        const response = await fetch(tokenURL);
        console.log('response', response);
        const xmlText = await response.text();
        console.log('text', xmlText);

        // Parse the XML using DOMParser
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        // Check for parser errors
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            throw new Error("Error parsing XML");
        }

        // Extract the <Key> value
        const keyElement = xmlDoc.getElementsByTagName("Key")[0];
        const sessionKey = keyElement ? keyElement.textContent : null;

        if (!sessionKey) {
            throw new Error("Session key not found in the XML response");
        }

        // Return the session key
        return sessionKey;
    } catch (error) {
        console.error('Error fetching or parsing XML:', error);
        throw error;
    }
};

// Get Callisgn data via XML

async function getCallsignData(url) {
    try {
        const response = await fetch(url);
        const xmlText = await response.text();

        // Parse the XML using DOMParser
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        // Check for parser errors
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            throw new Error("Error parsing XML");
        }

        // Get the namespace URI from the root element
        const namespaceURI = xmlDoc.documentElement.namespaceURI;

        // Helper function to get text content of an element by tag name within a namespace
        function getElementText(tagName, parentElement = xmlDoc) {
            const elements = parentElement.getElementsByTagNameNS(namespaceURI, tagName);
            return elements.length > 0 ? elements[0].textContent : null;
        }

        // Extract <SubExp> value from <Session>
        const sessionElement = xmlDoc.getElementsByTagNameNS(namespaceURI, 'Session')[0];
        const subExp = getElementText('SubExp', sessionElement);

        if (!subExp) {
            throw new Error("SubExp not found in XML");
        }

        // Extract required data from <Callsign>
        const callsignElement = xmlDoc.getElementsByTagNameNS(namespaceURI, 'Callsign')[0];

        if (!callsignElement) {
            throw new Error("Callsign element not found in XML");
        }

        const data = {};

        // Get common fields
        data.fname = getElementText('fname', callsignElement);
        data.name = getElementText('name', callsignElement);
        data.addr2 = getElementText('addr2', callsignElement);
        data.country = getElementText('country', callsignElement);

        // If SubExp is not "non-subscriber", include additional data
        if (subExp !== 'non-subscriber') {
            data.grid = getElementText('grid', callsignElement);
        }

        // Return the extracted data
        return data;

    } catch (error) {
        console.error('Error fetching or parsing XML:', error);
        throw error;
    }
}
// examlpe
function getCallsignMeta(callsign) {
    getSessionKey()
        .then(sessionKey => {
            console.log('Session Key:', sessionKey);
            // You can assign it to a constant if needed
            const requestURL = `https://xmldata.qrz.com/xml/current/?s=${sessionKey};callsign=${callsign}`;
            getCallsignData(requestURL)
                .then(data => {
                    console.log('Callsign Data:', data);
                    // You can assign individual fields to constants if needed
                    const { fname, name, addr2, country, grid } = data;

                    //get geolocation of callsign

                    getLatLon(addr2, country).then(coords => {
                        console.log(coords); // Output: { lat: 51.046295900000004, lon: 0.6311262337054269 }
                        // Distance of transmission:
                        let distance = haversineDistance(coords.lat, coords.lon, qrzPref.lat, qrzPref.lon)
                        qrz = {
                            fname: fname,
                            name: name,
                            distance: distance,
                            address: addr2,
                            country: country,
                            grid: grid || ''
                        }
                        console.log(callsign, qrz);

                        document.getElementById('distance').innerText = Math.round(qrz.distance);
                        addToLog(`${senderCallsign} is about ${qrz.distance} away from you`);

                        return qrz;

                    });
                })
                .catch(error => {
                    console.error('Failed to get callsign data:', error);
                });

        })
        .catch(error => {
            console.error('Failed to get session key:', error);
        });
};

// Estimate distance of transmission

// Get geoloactions

async function getLatLon(address1, address2) {
    // Step 1: Format the address strings and join them
    const joinedString = `${address1.replace(/ /g, '+')}+${address2.replace(/ /g, '+')}`;

    // Step 2: Construct the API URL
    const url = `https://nominatim.openstreetmap.org/search.php?q=${joinedString}&format=jsonv2`;

    try {
        // Step 3: Fetch data from the API
        const response = await fetch(url);
        const data = await response.json();

        // Step 4: Check if data exists and extract lat/lon from the first result
        if (data.length > 0) {
            const { lat, lon } = data[0];
            return {
                lat: parseFloat(lat),
                lon: parseFloat(lon)
            };
        } else {
            throw new Error("Location not found.");
        }
    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}





function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in kilometers
}

// Example usage:
const lat1 = 35.5; // Latitude for Last Vega (sample)
const lon1 = -98.5; // Longitude for Last Vega (sample)
const lat2 = 51.06; // Latitude for Rolvenden
const lon2 = 0.65;  // Longitude for Rolvenden

// const distance = haversineDistance(lat1, lon1, lat2, lon2);


