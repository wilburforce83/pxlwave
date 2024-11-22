// RX_worker.js

self.onmessage = function (event) {
    const {
        samples,
        sampleRate,
        expectedFrequencies,
        calibrationOffset,
        amplitudeThreshold,
    } = event.data;

    try {
        // Apply Hamming window to samples
        const windowedSamples = applyHammingWindow(samples);

        // Analyze frequencies
        let detectedFrequency = null;
        let maxMagnitude = -Infinity;

        for (const targetFreq of expectedFrequencies) {
            const adjustedFreq = targetFreq + calibrationOffset;
            const magnitude = goertzel(windowedSamples, sampleRate, adjustedFreq);

            if (magnitude > amplitudeThreshold && magnitude > maxMagnitude) {
                maxMagnitude = magnitude;
                detectedFrequency = targetFreq; // Store the original frequency
            }
        }

        // Post detected frequency back to the main thread
        const timestamp = Date.now(); // High-resolution timestamp
        if (detectedFrequency) {
            self.postMessage({
                detectedFrequency,
                magnitude: maxMagnitude,
                startTime: timestamp,
                delta: PROCESSING_INTERVAL,
            });
        } else {
            self.postMessage({
                detectedFrequency: null,
                magnitude: null,
                startTime: timestamp,
                delta: PROCESSING_INTERVAL,
            });
        }
    } catch (error) {
        console.error('Worker processing error:', error);
        self.postMessage({
            detectedFrequency: null,
            magnitude: null,
            error: error.message,
        });
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
    let q0 = 0,
        q1 = 0,
        q2 = 0;

    for (let i = 0; i < N; i++) {
        q0 = coeff * q1 - q2 + samples[i];
        q2 = q1;
        q1 = q0;
    }

    const real = q1 - q2 * cosine;
    const imag = q2 * sine;
    return Math.sqrt(real * real + imag * imag);
}
