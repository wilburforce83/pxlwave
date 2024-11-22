self.onmessage = (event) => {
    const { samples, sampleRate, expectedFrequencies, calibrationOffset } = event.data;

    try {
        const windowedSamples = applyHammingWindow(samples);
        let detectedFrequency = null;
        let maxMagnitude = -Infinity;

        const startTime = performance.now(); // Record the start time of the function execution

        for (const targetFreq of expectedFrequencies) {
            const adjustedFreq = targetFreq + calibrationOffset; // Adjust frequency for calibration offset
            const magnitude = goertzel(windowedSamples, sampleRate, adjustedFreq);

            if (magnitude > maxMagnitude) {
                maxMagnitude = magnitude;
                detectedFrequency = targetFreq;
            }
        }

        const endTime = performance.now(); // Record the end time
        const duration = endTime - startTime; // Calculate the duration in milliseconds

        if (detectedFrequency) {
            self.postMessage({
                detectedFrequency,
                startTime,
                duration, // Actual execution duration in ms
            });
        } else {
            self.postMessage({
                detectedFrequency: null,
                startTime,
                duration,
            });
        }
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
