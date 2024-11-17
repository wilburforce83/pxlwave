// TX_worker.js - Worker script for managing transmission tasks

// Listen for messages from transmit.js
onmessage = function(e) {
    const { action, data } = e.data;
    switch(action) {
        case 'generateToneSequence':
            const toneSequence = generateToneSequence(data.gridData, data.toneMap);
            postMessage({ action: 'toneSequenceGenerated', toneSequence });
            break;
        case 'calculateNextInterval':
            const nextInterval = calculateNextTransmissionInterval(data.now, data.epoch, data.intervalMs);
            postMessage({ action: 'nextIntervalCalculated', nextInterval });
            break;
        default:
            console.error('Unknown action:', action);
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
