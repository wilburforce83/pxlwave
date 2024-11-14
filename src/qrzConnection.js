// qrzPref const loaded in ui.js ln 193

// qrz connection file
let qrzPref;
let qrz = {};
let qrzUser = '';
let qrzPassword = '';
let tokenURL = '';
let qrzToken = '';

// XML token collection


// Get Callisgn data via XML

// Modified getCallsignMeta function with error handling
async function getCallsignMeta(callsign) {
    try {
        const sessionKey = await getSessionKey();
        if (!sessionKey) {
            console.log('Session key is undefined or invalid.');
            return;
        }
        console.log('Session Key:', sessionKey);

        const requestURL = `https://xmldata.qrz.com/xml/current/?s=${sessionKey};callsign=${callsign}`;
        const data = await getCallsignData(requestURL);
        if (!data) {
            console.log('Callsign data is undefined or invalid.');
            return;
        }
        console.log('Callsign Data:', data);

        const { fname, name, addr2, country, grid } = data;

        // Get geolocation of callsign
        const coords = await getLatLon(addr2, country);
        if (!coords) {
            console.log('Coordinates not found.');
            return;
        }
        console.log('Coordinates:', coords);

        // Distance of transmission
        let distance = haversineDistance(coords.lat, coords.lon, qrzPref.lat, qrzPref.lon);
        qrz = {
            fname: fname || '',
            name: name || '',
            distance: distance || 0,
            address: addr2 || '',
            country: country || '',
            grid: grid || ''
        };
        console.log(callsign, qrz);

        document.getElementById('distance').innerText = Math.round(qrz.distance);
        addToLog(`${callsign} is about ${Math.round(qrz.distance)} km away from you`);

        return qrz;

    } catch (error) {
        console.error('Error in getCallsignMeta:', error);
        // Swallow the error and allow the rest of the code to continue
        return;
    }
}

// Modified getSessionKey function with error handling
async function getSessionKey() {
    try {
        qrzPref = await ipcRenderer.invoke('load-preferences');
        if (qrzPref.qrzUsername && qrzPref.qrzPassword) {
            qrzUser = qrzPref.qrzUsername;
            qrzPassword = qrzPref.qrzPassword;
            tokenURL = `https://xmldata.qrz.com/xml/?username=${qrzUser};password=${qrzPassword}`;
        } else {
            console.log("QRZ login credentials are missing.");
            return null;
        }

        const response = await fetch(tokenURL);
        const xmlText = await response.text();

        // Parse the XML using DOMParser
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        // Check for parser errors
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            console.log("Error parsing XML");
            return null;
        }

        // Extract the <Key> value
        const keyElement = xmlDoc.getElementsByTagName("Key")[0];
        const sessionKey = keyElement ? keyElement.textContent : null;

        if (!sessionKey) {
            console.log("Session key not found in the XML response");
            return null;
        }

        // Return the session key
        return sessionKey;

    } catch (error) {
        console.error('Error in getSessionKey:', error);
        return null;
    }
}

// Modified getCallsignData function with error handling
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
            console.log("Error parsing XML");
            return null;
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
            console.log("SubExp not found in XML");
        }

        // Extract required data from <Callsign>
        const callsignElement = xmlDoc.getElementsByTagNameNS(namespaceURI, 'Callsign')[0];

        if (!callsignElement) {
            console.log("Callsign element not found in XML");
            return null;
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
        console.error('Error in getCallsignData:', error);
        return null;
    }
}

// Modified getLatLon function with error handling
async function getLatLon(address1, address2) {
    try {
        // Format the address strings and join them
        const joinedString = `${address1.replace(/ /g, '+')}+${address2.replace(/ /g, '+')}`;

        // Construct the API URL
        const url = `https://nominatim.openstreetmap.org/search.php?q=${joinedString}&format=jsonv2`;

        // Fetch data from the API
        const response = await fetch(url);
        const data = await response.json();

        // Check if data exists and extract lat/lon from the first result
        if (data.length > 0) {
            const { lat, lon } = data[0];
            return {
                lat: parseFloat(lat),
                lon: parseFloat(lon)
            };
        } else {
            console.log("Location not found.");
            return null;
        }
    } catch (error) {
        console.error("Error in getLatLon:", error);
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


