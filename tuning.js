// File containing modulation tuning data

const minimumToneFreq = 950;
const totalBandwidth = 350;
const fftSize = 4096 // 1024, 2048, 4096, 8192 etc higher has better frequency reolsution but is slower and requires longer tones



const toneMaps = generateToneMaps(minimumToneFreq, totalBandwidth); /*

      toneMaps.RX_CHAR_FREQ_MAP
      toneMaps.RX_32C_TONE_MAP
      toneMaps.RX_4T_TONE_MAP
      toneMaps.RX_MIN_TONE_FREQ
      toneMaps.RX_MAX_TONE_FREQ

| FFT Size | Time Resolution (ms) | Frequency Resolution (Hz) | Approx. Effective Frequency Resolution (Hz) |
|----------|-----------------------|----------------------------|---------------------------------------------|
| 32       | 0.73                 | 1378.13                    | 344.53                                      |
| 64       | 1.45                 | 689.06                     | 172.27                                      |
| 128      | 2.90                 | 344.53                     | 86.13                                       |
| 256      | 5.80                 | 172.27                     | 43.07                                       |
| 512      | 11.61                | 86.13                      | 21.53                                       |
| 1024     | 23.22                | 43.07                      | 10.77                                       |
| 2048     | 46.44                | 21.53                      | 5.38                                        |
| 4096     | 92.88                | 10.77                      | 2.69                                        |
| 8192     | 185.76               | 5.38                       | 1.34                                        |
| 16384    | 371.52               | 2.69                       | 0.67                                        |
| 32768    | 743.04               | 1.35                       | 0.34                                        |

e.g. at fft size of 1024, we should be able to accurately sample frequency changes within 23ms but we must have a frequency gap
between tones of probably upwards of 20hz, so a bandwidth of about 800hz

CALCULATIONS BASED ON TUNING FIGURES TO BE USED ACROSS BOTH TRANSMIT.JS AND RECEIVE.JS


|           |          |         |        |          |         |          |           |
V           V          V         V        V          V         V          V           V


*/
// calculate max tone frequency
const maximumToneFreq = minimumToneFreq+totalBandwidth;


function generateToneMaps(minimumToneFreq, totalBandwidth) {
    const reservedCalibrationBandwidth = 50; // Reserve 50 Hz at each end for calibration
    const availableBandwidth = totalBandwidth - reservedCalibrationBandwidth; // Usable bandwidth
    const stepSize = availableBandwidth / 38; // Calculate step size for 38 tones

    const charFrequencyMap = {};
    const tone32CMap = [];
    const tone4TMap = [];

    // Generating RX_CHAR_FREQ_MAP
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ';
    for (let i = 0; i < characters.length; i++) {
        charFrequencyMap[characters[i]] = minimumToneFreq + (i * stepSize);
    }
    charFrequencyMap['EOL'] = minimumToneFreq + (characters.length * stepSize); // Special end-of-line tone

    // Generating RX_32C_TONE_MAP
    for (let i = 0; i < 32; i++) {
        tone32CMap.push(minimumToneFreq + (i * stepSize));
    }

    // Generating RX_4T_TONE_MAP (every 8th tone from RX_32C_TONE_MAP)
    for (let i = 0; i < 4; i++) {
        tone4TMap.push(tone32CMap[i * 8]);
    }

    return {
        RX_CHAR_FREQ_MAP: charFrequencyMap,
        RX_32C_TONE_MAP: tone32CMap,
        RX_4T_TONE_MAP: tone4TMap,
        RX_MIN_TONE_FREQ: minimumToneFreq,
        RX_MAX_TONE_FREQ: minimumToneFreq + totalBandwidth
    };
}

// Example usage:

console.log(toneMaps);

