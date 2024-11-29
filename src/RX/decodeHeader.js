
// Decode the header tones





function headerFECArr(startTime) {
    const repetitions = FEC_HD_REPEAT; // repetitions of the header tones
    const tonesPerHeader = MAX_CHAR_HEADER; // Number of tones in the header
    const datumFrequency = CALIBRATION_TONE_MAX; // Calibration frequency to find datum timestamp
    const maxDatumTime = startTime + 20000; // Maximum time for the datum start
    let SanitisedFrequencies = dropRogueTonesObjects(RX_state.rawReceivedFrequencies, HEADER_TONE_DURATION / (RX_ANALYSIS_INTERVAL * 4), "frequency")
console.log('sanatised frequencies:', SanitisedFrequencies);
    // Find the datum startTime (last occurrence of 1800 Hz within the maxDatumTime window)
    const datumElement = SanitisedFrequencies
        .filter(({ frequency, startTime }) => frequency === datumFrequency && startTime < maxDatumTime)
        .pop();

    if (!datumElement) {
        console.error("No datum frequency (1800 Hz) found within the specified time window.");
        return null;
    }

    RX_state.datumStartTime = datumElement.startTime //+ (HEADER_TONE_DURATION * 0.75);
    console.log(`datumStartTime = ${RX_state.datumStartTime}, datumElement = ${datumElement.startTime}`);
    console.log(datumElement);
    console.log(RX_state.rawReceivedFrequencies);
    // Initialize groupedHeaderFrequencies with 'repetitions' number of empty arrays
    RX_state.groupedHeaderFrequencies = Array.from({ length: repetitions }, () => []);

    // Process header tones for each repetition
    for (let repetition = 0; repetition < repetitions; repetition++) {
        for (let toneIndex = 0; toneIndex < tonesPerHeader; toneIndex++) {
            // Calculate the center time of the current tone
            const toneCenterTime = RX_state.datumStartTime + (repetition * tonesPerHeader + toneIndex) * HEADER_TONE_DURATION;

            // Calculate the time window (±20% of HEADER_TONE_DURATION around the center)
            const timeWindowStart = toneCenterTime - (HEADER_TONE_DURATION * 0.25);
            const timeWindowEnd = toneCenterTime + (HEADER_TONE_DURATION * 0.25);

            // Find all frequencies whose startTime falls within the time window
            const toneFrequencies = SanitisedFrequencies
                .filter(({ startTime }) => startTime >= timeWindowStart && startTime <= timeWindowEnd)
                .map(({ frequency }) => frequency);

            // Calculate the mode frequency (most frequently occurring frequency)
            const modeFrequency = calculateMode(toneFrequencies);
            RX_state.groupedHeaderFrequencies[repetition].push(modeFrequency);
        }
    }

    return RX_state.groupedHeaderFrequencies;
}

// Helper: Calculate the mode (most frequently occurring element)
function calculateMode(array) {
    const frequencyMap = {};
    array.forEach((value) => {
        // Only include valid numbers
        if (typeof value === 'number' && !isNaN(value)) {
            frequencyMap[value] = (frequencyMap[value] || 0) + 1;
        }
    });

    let mode = null;
    let maxCount = -1;

    // Find the mode among valid numbers
    for (const [value, count] of Object.entries(frequencyMap)) {
        if (count > maxCount) {
            mode = Number(value);
            maxCount = count;
        }
    }

    // If no valid mode found, attempt to find a single valid number
    if ((mode === null || isNaN(mode))) {
        for (let i = 0; i < array.length; i++) {
            if (typeof array[i] === 'number' && !isNaN(array[i])) {
                mode = array[i];
                break;
            }
        }
    }

    return mode;
}






function majorityVote(headerArrays) {
    const tonesPerHeader = headerArrays[0].length;

    const result = [];
    for (let i = 0; i < tonesPerHeader; i++) {
        // Extract the i-th tone from each array
        const toneSet = headerArrays.map((array) => array[i]);
        const majorityTone = calculateMode(toneSet); // Use the mode calculation from above
        result.push(majorityTone);
    }

    return result;
}




function decodeHeaderAndUpdateUI(headerFrequencies) {
    // Function to snap to the nearest frequency
    const snapToFrequency = (frequency) => {
        let snappedChar = null;
        let minDifference = Infinity;

        // Iterate over the character-to-frequency map
        for (const [char, expectedFreq] of Object.entries(CHAR_FREQ_MAP)) {
            const diff = Math.abs(frequency - expectedFreq);
            if (diff < minDifference && diff <= RX_SNAP_THRESHOLD) {
                snappedChar = char; // Snap to this character
                minDifference = diff;
            }
        }

        return snappedChar || ''; // Return '-' if no valid snap is found
    };

    // Decode the header string with snapping
    const decodedHeader = headerFrequencies
        .map((frequency) => snapToFrequency(frequency)) // Snap frequencies to characters
        .join('');

    console.log("Decoded Header String:", decodedHeader);

    // Split the header into components
    const [sender, recipient, mode] = decodedHeader.split('-');

    // Inject the details into the HTML
    document.getElementById('image-type').textContent = mode || 'N/A';
    document.getElementById('sender-callsign').textContent = sender || 'N/A';
    document.getElementById('recipient-callsign').textContent = recipient || 'N/A';
    addToLog("Header Recieved", 'rx', sender);
    // Example: Add meta information (e.g., distance from sender's callsign)
    contact.callsign = sender
        if (recipient === preferences.callsign){
          contact.directContact = true;  
        }
    getCallsignMeta(sender).then(qrz => {
       contact.fname = qrz.fname
       contact.name = qrz.name
       contact.addr2 = qrz.address
       contact.country = qrz.country
       contact.coordinates = qrz.coords
       contact.distanceKM = qrz.distance
    }).catch(error => {
        addToLog('Error fetching distance:', 'err');
        document.getElementById('distance').textContent = 'N/A';
    });;
    // After processing the header and obtaining RX_state.datumStartTime
    // Start the processing interval after the header is processed
    let ImageInterval = FEC ? (TONE_DURATION * 32 * 3) : TONE_DURATION * 32;
    RX_state.imageDecoding = setInterval(() => {
        processImageData();
    }, ImageInterval); // Adjust the interval timing as needed
    return { sender, recipient, mode }; // Return decoded components for further use if needed
};
