// TX_worker.js - Worker script for managing transmission tasks

let TONE_DURATION;
let HEADER_TONE_DURATION;
let GAP_DURATION;
let FEC;
let CALIBRATION_TONE_MIN;
let CALIBRATION_TONE_MAX;
let CALIBRATION_TONE_DURATION;
let toneMaps = {};

onmessage = function (e) {
    const { action, data, transmissionData } = e.data;
    switch (action) {
        case 'initialize':
            // Store constants and toneMaps
            TONE_DURATION = data.TONE_DURATION;
            HEADER_TONE_DURATION = data.HEADER_TONE_DURATION;
            GAP_DURATION = data.GAP_DURATION;
            FEC = data.FEC;
            CALIBRATION_TONE_MIN = data.CALIBRATION_TONE_MIN;
            CALIBRATION_TONE_MAX = data.CALIBRATION_TONE_MAX;
            CALIBRATION_TONE_DURATION = data.CALIBRATION_TONE_DURATION;
            toneMaps = data.toneMaps;
            console.log('Worker initialized with constants and tone maps.');
            break;
        case 'generateToneSequence':
            if (transmissionData) {
                console.log('Worker: Generating tone sequence...');
                const toneSequence = generateToneSequence(transmissionData);
                // Send the generated tone sequence back
                postMessage({ action: 'toneSequenceGenerated', toneSequence, transmissionData });
                console.log('Worker: Tone sequence generated and sent to main thread.');
            } else {
                console.error('Worker: Missing transmission data for tone sequence generation.');
            }
            break;
        case 'calculateNextInterval':
            if (data && data.now && data.epoch && data.intervalMs) {
                console.log('Worker: Calculating next interval...');
                const nextInterval = calculateNextTransmissionInterval(data.now, data.epoch, data.intervalMs);
                // Send the calculated interval back
                postMessage({ action: 'nextIntervalCalculated', nextInterval, transmissionData });
                console.log('Worker: Next interval calculated and sent to main thread.');
            } else {
                console.error('Worker: Missing required data for interval calculation.');
            }
            break;
        default:
            console.error('Worker: Unknown action:', action);
    }
};

// Function to generate the tone sequence
function generateToneSequence(transmissionData) {
    const toneSequence = [];
    const HEADER_REPEAT_COUNT = 3; // Number of times to repeat the header for error correction
    const FEC_REPEAT_COUNT = FEC ? 3 : 1; // Repeat count for grid data tones based on FEC

    // Step 1: Add Min Calibration Tone
    toneSequence.push({
        frequency: CALIBRATION_TONE_MIN,
        duration: CALIBRATION_TONE_DURATION
    });

    // Step 2: Add Max Calibration Tone
    toneSequence.push({
        frequency: CALIBRATION_TONE_MAX,
        duration: CALIBRATION_TONE_DURATION
    });

    // Step 3: Header Transmission
    const headerString = createHeaderString(transmissionData);
    for (let repeat = 0; repeat < HEADER_REPEAT_COUNT; repeat++) {
        for (const char of headerString) {
            const frequency = toneMaps.CHAR_FREQ_MAP[char];
            if (frequency !== undefined) {
                toneSequence.push({
                    frequency: frequency,
                    duration: HEADER_TONE_DURATION
                });
            } else {
                console.error(`No frequency mapping for character: ${char}`);
            }
        }
    }

    // Step 4: Grid Data Transmission with FEC
    const gridData = transmissionData.gridData; // Flat array of color indices
    for (let repeat = 0; repeat < FEC_REPEAT_COUNT; repeat++) {
        for (const colorIndex of gridData) {
            const frequency = toneMaps._32C_TONE_MAP[colorIndex];
            if (frequency !== undefined) {
                toneSequence.push({
                    frequency: frequency,
                    duration: TONE_DURATION
                });
            } else {
                console.error(`No frequency mapping for color index: ${colorIndex}`);
            }
        }
    }

    return toneSequence;
}

// Function to create the header string
function createHeaderString(transmissionData) {
    const sender = transmissionData.senderCallsign || 'UNKNOWN';
    const recipient = transmissionData.recipientCallsign || 'ALL';
    const mode = transmissionData.mode || '32C';

    let headerString = `${sender}-${recipient}-${mode}`.padEnd(17,' ');
    headerString = headerString.toUpperCase();

    // Replace unsupported characters with '-'
    headerString = headerString.replace(/[^A-Z0-9 -]/g, '-');
console.log(headerString);
    return headerString;
}

// Function to calculate the next transmission interval
function calculateNextTransmissionInterval(nowData, epochData, intervalMs) {
    const now = new Date(nowData);
    const epoch = new Date(epochData);

    const timeSinceEpoch = now.getTime() - epoch.getTime();
    const nextInterval = new Date(epoch.getTime() + Math.ceil(timeSinceEpoch / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(7);
    nextInterval.setUTCMilliseconds(0);
    return nextInterval;
}
