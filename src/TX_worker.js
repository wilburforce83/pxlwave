// TX_worker.js - Worker script for managing transmission tasks

onmessage = function(e) {
    const { action, data, transmissionData } = e.data;
    switch (action) {
        case 'generateToneSequence':
            if (data && data.gridData && data.toneMap) {
                console.log('Worker: Generating tone sequence...');
                const toneSequence = generateToneSequence(data.gridData, data.toneMap);
                
                // Send the generated tone sequence back
                postMessage({ action: 'toneSequenceGenerated', toneSequence, transmissionData });
                console.log('Worker: Tone sequence generated and sent to main thread.');
            } else {
                console.error('Worker: Missing required data for tone sequence generation.');
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

// Function to generate the tone sequence based on the provided grid data and tone map
function generateToneSequence(gridData, toneMap) {
    return gridData.map(colorIndex => toneMap[colorIndex]);
}

// Function to calculate the next transmission interval
function calculateNextTransmissionInterval(now, epoch, intervalMs) {
    const timeSinceEpoch = now.getTime() - epoch.getTime();
    const nextInterval = new Date(epoch.getTime() + Math.ceil(timeSinceEpoch / intervalMs) * intervalMs);
    nextInterval.setUTCSeconds(7);
    nextInterval.setUTCMilliseconds(0);
    return nextInterval;
}
