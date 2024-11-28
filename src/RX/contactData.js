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
    quality: 0,
    snr: 0
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