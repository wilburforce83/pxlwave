// Preferences const loaded in ui.js ln 193

// qrz connection file
const qrzUser = '';
const qrzPassword = '';
const tokenURL = '';
const qrzToken = '';

window.addEventListener('DOMContentLoaded', async () => {
    if (preferences.qrzUsername != "") {
        qrzUser = preferences.qrzUsername;
        qrzPassword = preferences.qrzPassword;
        tokenURL = `https://xmldata.qrz.com/xml/?username=${qrzUser};password=z${qrzPassword}`
    }
});

// XML token collection

async function getSessionKey() {

    try {
        const response = await fetch(tokenURL);
        const xmlText = await response.text();

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
                    // do stiff with it
                    console.log(data)
                })
                .catch(error => {
                    console.error('Failed to get callsign data:', error);
                });

        })
        .catch(error => {
            console.error('Failed to get session key:', error);
        });
};

