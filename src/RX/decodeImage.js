


function mapFrequencyToColorIndex(frequency) {
    let closestIndex = 50;
    if (frequency === null || isNaN(frequency)) {
        // Handle missing or invalid frequency
        closestIndex = gridData[gridData.length - 1];
        RX_state.errorCount++;
        return closestIndex; // Default color index (e.g., black)
    }

    // Find the index in _32C_TONE_MAP where the frequency is closest to the input frequency
    let minDiff = Infinity;

    for (let i = 0; i < _32C_TONE_MAP.length; i++) {
        const diff = Math.abs(frequency - _32C_TONE_MAP[i]);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    // if index returns as 50 (not found, use previous colour index)
    if (closestIndex === 50) {
        closestIndex = gridData[gridData.length - 1];
        RX_state.errorCount++;
    }
    return closestIndex;
}

function processImageData() {
    const lines = 32; // Number of lines in the image
    const pixelsPerLine = 32; // Number of pixels per line
    const FEC_REPEAT_COUNT = FEC_BD_REPEAT; // Number of times each line is repeated
    const totalPixels = lines * pixelsPerLine * FEC_REPEAT_COUNT;
    const gridData = RX_state.gridData || []; // Use existing gridData or initialize a new one

    // Calculate the total duration of the header
    const totalHeaderDuration = (FEC_HD_REPEAT * MAX_CHAR_HEADER * HEADER_TONE_DURATION) + HEADER_TONE_DURATION - (TONE_DURATION / 2);
    const imageStartTime = RX_state.datumStartTime + totalHeaderDuration //- (TONE_DURATION / 2);

    // Sanitize frequencies for image tones
    const SanitisedFrequencies = dropRogueTonesObjects(
        RX_state.rawReceivedFrequencies,
        TONE_DURATION / (RX_ANALYSIS_INTERVAL * RX_MIN_DELTA_DIVISOR),
        "frequency"
    );

    // Calculate the total number of tones received so far
    const totalReceivedTones = Math.floor(
        (SanitisedFrequencies[SanitisedFrequencies.length - 1].startTime - imageStartTime) / TONE_DURATION
    ) + 1;

    // Determine the number of tones to process
    const tonesToProcess = Math.min(totalReceivedTones, totalPixels);

    // Initialize an array to hold the lines
    if (!RX_state.receivedLines) {
        RX_state.receivedLines = [];
    }

    // Process new tones
    for (let toneIndex = RX_state.lastProcessedToneIndex; toneIndex < tonesToProcess; toneIndex++) {
        const toneCenterTime = imageStartTime + toneIndex * TONE_DURATION;

        // Calculate the time window for the current tone
        const timeWindowStart = toneCenterTime - (TONE_DURATION * 0.25);
        const timeWindowEnd = toneCenterTime + (TONE_DURATION * 0.25);

        // Find frequencies within the time window
        const toneFrequencies = SanitisedFrequencies
            .filter(({ startTime }) => startTime >= timeWindowStart && startTime <= timeWindowEnd)
            .map(({ frequency }) => frequency);

        // Determine the frequency (calculate the mode)
        const frequency = calculateMode(toneFrequencies);

        // Map frequency to color index
        const colorIndex = mapFrequencyToColorIndex(frequency);

        // Calculate the line and pixel index
        const overallToneIndex = toneIndex;
        const repeatedLineIndex = Math.floor(overallToneIndex / (pixelsPerLine * FEC_REPEAT_COUNT));
        const repeatIndex = Math.floor((overallToneIndex % (pixelsPerLine * FEC_REPEAT_COUNT)) / pixelsPerLine);
        const pixelIndex = overallToneIndex % pixelsPerLine;

        // Initialize the line data structure
        if (!RX_state.receivedLines[repeatedLineIndex]) {
            RX_state.receivedLines[repeatedLineIndex] = [];
        }
        if (!RX_state.receivedLines[repeatedLineIndex][repeatIndex]) {
            RX_state.receivedLines[repeatedLineIndex][repeatIndex] = [];
        }

        // Append color index to the line data
        RX_state.receivedLines[repeatedLineIndex][repeatIndex][pixelIndex] = colorIndex;
    }

    // Update the last processed tone index
    RX_state.lastProcessedToneIndex = tonesToProcess;

    // Perform majority vote on lines that have all repetitions received
    for (let lineIndex = RX_state.lastRenderedLineIndex || 0; lineIndex < RX_state.receivedLines.length; lineIndex++) {
        const lineRepetitions = RX_state.receivedLines[lineIndex];

        // Check if all repetitions are received
        if (lineRepetitions.length === FEC_REPEAT_COUNT) {
            // Perform majority vote
            const majorityLine = ImageMajorityVote(lineRepetitions);

            // Append the majority line to gridData
            for (let i = 0; i < majorityLine.length; i++) {
                gridData[lineIndex * pixelsPerLine + i] = majorityLine[i];
            }

            // Update the last rendered line index
            RX_state.lastRenderedLineIndex = lineIndex + 1;
        } else {
            break; // Wait for more repetitions to be received
        }
    }

    // Store the gridData back to RX_state
    RX_state.gridData = gridData;

    let canvas = document.getElementById('rx-display');

    // Render the canvas after each line is processed
    renderGridToCanvas(canvas, gridData, 256, false);

    // Check if the image is fully received
    if (RX_state.lastProcessedToneIndex >= totalPixels) {
        // Image reception is complete
        const averageSNR = calculateAverageSNR(RX_state.rawReceivedFrequencies);
        const grading = calculateQualityAndRarity(RX_state.errorCount, averageSNR, contact.distanceKM);
        let now = new Date();
        // update contact details:
        contact.grading = grading;
        contact.gridData = gridData;
        contact.snr = averageSNR;
        contact.errorCount = RX_state.errorCount;
        contact.timeStamp = now;
        saveContact(contact);
       
    }
}

function saveContact(data) {
    ipcRenderer.invoke('save-contact', data)
        .then(result => {
            // Handle the result here
            console.log('Save result:', data);
            console.log('Transmission Completed, stopping listening, and clearing image decoding');
            addToLog(`New contact! ${data.grading.grade}, Total score; ${data.grading.totalScore}`, 'win')
            clearInterval(RX_state.imageDecoding);
            RX_stopListening('processImageData()');
        })
        .catch(error => {
            // Handle any errors here
            console.error('Error saving card:', error);
        });
}

// Function to perform majority vote on repeated lines
function ImageMajorityVote(lineRepetitions) {
    const pixelsPerLine = lineRepetitions[0].length;
    const majorityLine = [];

    for (let pixelIndex = 0; pixelIndex < pixelsPerLine; pixelIndex++) {
        const votes = {};

        // Collect votes from each repetition
        for (let repeat = 0; repeat < lineRepetitions.length; repeat++) {
            const colorIndex = lineRepetitions[repeat][pixelIndex];
            if (colorIndex !== undefined) {
                votes[colorIndex] = (votes[colorIndex] || 0) + 1;
            }
        }

        // Determine the majority vote
        let maxVotes = 0;
        let majorityColorIndex = null;
        for (const [colorIndex, count] of Object.entries(votes)) {
            if (count > maxVotes) {
                maxVotes = count;
                majorityColorIndex = parseInt(colorIndex);
            }
        }

        // If there's a tie, choose the first one (you can adjust this logic)
        majorityLine[pixelIndex] = majorityColorIndex !== null ? majorityColorIndex : 0; // Default color index if undecided
    }

    return majorityLine;
}




