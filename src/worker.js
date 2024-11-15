// worker.js

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

// Utility: Find the closest frequency in the expected list
function findClosestFrequency(frequency, expectedFrequencies, calibrationOffset, threshold) {
    let closest = null;
    let minDiff = Infinity;

    for (const freq of expectedFrequencies) {
        const adjustedFreq = freq + calibrationOffset;
        const diff = Math.abs(adjustedFreq - frequency);
        if (diff < minDiff && diff <= threshold) {
            minDiff = diff;
            closest = freq;
        }
    }

    return closest;
}

// Worker message handler
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
        if (detectedFrequency) {
            self.postMessage({
                detectedFrequency,
                magnitude: maxMagnitude,
            });
        } else {
            // No valid frequency detected
            self.postMessage({
                detectedFrequency: null,
                magnitude: null,
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
