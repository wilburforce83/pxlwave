let contact = {
    // Full object of contact data for storing after receiving
    callsign: '',
    fname: '',
    name: '',
    directContact: false,
    addr2: '',
    country: '',
    coordinates: {},
    timeStamp: '',
    distanceKM: 0,
    gridData: [],
    errorCount: 0,
    snr: 0,
    grading: {
        qualityScore: 0,
        snrScore: 0,
        distanceScore: 0,
        totalScore: 0,
        grade: ''
    }
}


// Calculate the average SNR of RX
const calculateAverageSNR = (rawReceivedFrequencies) => {
    if (!rawReceivedFrequencies || rawReceivedFrequencies.length === 0) {
        return 0; // Return 0 if there are no SNR values
    }

    // Convert SNR values from dB to linear scale
    const linearSNRs = rawReceivedFrequencies.map(freqData => Math.pow(10, freqData.snr / 10));

    // Calculate the average in linear scale
    const averageLinearSNR = linearSNRs.reduce((sum, snr) => sum + snr, 0) / linearSNRs.length;

    // Convert the average back to dB
    const averageSNRdB = 10 * Math.log10(averageLinearSNR);

    return averageSNRdB;
};



function calculateQualityAndRarity(errors, snr, distance, maxDistance = 20000) {
    /**
     * Calculates quality and rarity scores for a received HF DX transmission.
     *
     * Parameters:
     * - errors (number): The number of errors out of 1024 (lower is better).
     * - snr (number): The signal-to-noise ratio (in dB) of the processed data after filtering and manipulation.
     * - distance (number): The transmission distance in kilometers.
     * - maxDistance (number): The theoretical maximum global distance (default is 20,000 km).
     *
     * Returns:
     * - Object: Contains individual scores (quality, SNR, distance), total score, and grade.
     */

    // Helper function for clamping values within a range
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    // Quality Score (Error Count)
    let qualityScore = 100 * (1 - errors / 150);
    qualityScore = clamp(qualityScore, 0, 100);

    // SNR Score
    const snrMin = 17, snrMax = 27;
    let snrScore = 100 * (1 - (clamp(snr, snrMin, snrMax) - snrMin) / (snrMax - snrMin));
    snrScore = clamp(snrScore, 0, 100);

    // Distance Score (Logarithmic Scaling)
    let distanceScore = 100 * Math.log1p(clamp(distance, 0, maxDistance)) / Math.log1p(maxDistance);

    // Combined Total Score
    const totalScore = (qualityScore + snrScore + distanceScore) / 3;

    // Determine Grade
    let grade;
    if (totalScore >= 90) grade = 'S - Ultra Rare';
    else if (totalScore >= 75) grade = 'A - Excellent';
    else if (totalScore >= 50) grade = 'B - Good';
    else if (totalScore >= 25) grade = 'C - Common';
    else grade = 'D - Poor';

    // Return all scores and the grade
    return {
        qualityScore: parseFloat(qualityScore.toFixed(2)),
        snrScore: parseFloat(snrScore.toFixed(2)),
        distanceScore: parseFloat(distanceScore.toFixed(2)),
        totalScore: parseFloat(totalScore.toFixed(2)),
        grade: grade
    };
}



/* Calculate scores and grade
const result = calculateQualityAndRarity(
    receivedImageData.errors,
    receivedImageData.snr,
    receivedImageData.distance
);

*/


function LoadContacts() {
    ipcRenderer.invoke('load-contact')
        .then(result => {
            // Handle the result here
           // console.log('Save result:', result);
           savedContacts = result;
        })
        .catch(error => {
            // Handle any errors here
            console.error('Error saving card:', error);
        });
}