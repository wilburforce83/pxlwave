// RX_worker.js

self.onmessage = (event) => {
    const { startTime, samples, sampleRate, expectedFrequencies, calibrationOffset } = event.data;
    const endTime = performance.now(); // Record the end time
    const duration = endTime - startTime; // Calculate the duration in milliseconds
    try {
        const windowedSamples = applyHammingWindow(samples);
        let detectedFrequency = null;
        let maxMagnitude = -Infinity;
        let frequencyMagnitudes = []; // Array to store magnitudes of all frequencies


        // Calculate magnitudes for all expected frequencies
        for (const targetFreq of expectedFrequencies) {
            const adjustedFreq = targetFreq + calibrationOffset; // Adjust frequency for calibration offset
            const magnitude = goertzel(windowedSamples, sampleRate, adjustedFreq);

            // Collect magnitudes for debugging
            frequencyMagnitudes.push({ frequency: adjustedFreq, magnitude });

            if (magnitude > maxMagnitude) {
                maxMagnitude = magnitude;
                detectedFrequency = targetFreq;
            }
        }

        // Calculate dynamic threshold using mean and standard deviation
        const magnitudes = frequencyMagnitudes.map(({ magnitude }) => magnitude);
        const meanMagnitude =
            magnitudes.reduce((sum, magnitude) => sum + magnitude, 0) / magnitudes.length;

        const variance =
            magnitudes.reduce((sum, magnitude) => sum + Math.pow(magnitude - meanMagnitude, 2), 0) /
            magnitudes.length;

        const stdDeviation = Math.sqrt(variance);
        const dynamicThreshold = meanMagnitude + (stdDeviation * 3.5); // Adjust multiplier as needed

        // Filter out detected frequency if its magnitude is below the dynamic threshold
        if (maxMagnitude < dynamicThreshold || maxMagnitude < 4) { // dynamic noise floor + minimum signal magnitude requirement
        //   console.log(`Filtered out frequency: ${detectedFrequency} with magnitude ${maxMagnitude} (Threshold: ${dynamicThreshold})`);
            return; // Skip processing if below threshold
        }
      // console.log(`Passed frequency: ${detectedFrequency} with magnitude ${maxMagnitude} (Threshold: ${dynamicThreshold})`);

        

        // Send back results
        self.postMessage({
            detectedFrequency,
            startTime,
            duration,
            maxMagnitude,
            frequencyMagnitudes, // Send back the magnitudes array
            dynamicThreshold, // Include dynamic threshold for debugging
            meanMagnitude,
            stdDeviation,
        });
    } catch (error) {
        console.error('Worker processing error:', error);
    }
};




// Utility: Apply Hamming window to samples
function applyHammingWindow(samples) {
    const N = samples.length;
    return samples.map((sample, n) => sample * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1))));
}

// Utility: Goertzel algorithm for frequency detection
function goertzel(samples, sampleRate, targetFreq) {
    const N = samples.length;
    const k = Math.round((N * targetFreq) / sampleRate);
    const omega = (2.0 * Math.PI * k) / N;
    const sine = Math.sin(omega);
    const cosine = Math.cos(omega);
    const coeff = 2.0 * cosine;
    let q0 = 0;
    let q1 = 0;
    let q2 = 0;

    for (let i = 0; i < N; i++) {
        q0 = coeff * q1 - q2 + samples[i];
        q2 = q1;
        q1 = q0;
    }

    const real = q1 - q2 * cosine;
    const imag = q2 * sine;
    return Math.sqrt(real * real + imag * imag);
}
