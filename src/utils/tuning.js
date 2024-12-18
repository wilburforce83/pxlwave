// File containing modulation tuning data
const { ipcRenderer } = require('electron');
// Modulation: these are the 5 big variables to change the modulation of pxlwave
const MIN_TONE_FREQ = 800;
const BANDWIDTH = 1500;
const FFT_SIZE = 8192; // 1024, 2048, 4096, 8192 etc higher has better frequency reolsution but is slower and requires longer tones
const TONE_DURATION = 50; // milliseconds per tone
const HEADER_TONE_DURATION = 65; // milliseconds for header tones
const CALIBRATION_TONE_DURATION = 500;
const GAP_DURATION = 5; // % of tone duration
const MAGNITUDE_THRESH = 10;
const MAX_CHAR_HEADER = 17


// RX specific

const RX_ANALYSIS_INTERVAL = 5;     // in ms the trigger interval for sampling
const RX_MIN_DELTA_DIVISOR = 3;
const RX_startTime = 6; // Start listening + x seconds past the minute
const RX_endTime = 15; // Timeout if no calibration tone detected by +15 seconds
var RX_COMPRESSOR_STATE = false;
var RX_BANDPASS_STATE = true;

// TX Specific
const USE_SMOOTH_TRANSITIONS = true; // Set to false to disable smooth transitions
const FEC = true;
const FEC_HD_REPEAT = 5 // how many times to repeat the header: image repeats 3 times only on FEC
const FEC_BD_REPEAT = 4 // how many times the image repeats


const FFT_RES = {
    "32": 0.73,
    "64": 1.45,
    "128": 2.90,
    "256": 5.80,
    "512": 11.61,
    "1024": 23.22,
    "2048": 46.44,
    "4096": 92.88,
    "8192": 185.76,
    "16384": 371.52,
    "32768": 743.04
}
/*

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

// generating tone maps from modulation variables
const toneMaps = generateToneMaps(MIN_TONE_FREQ, BANDWIDTH); /*

      toneMaps.CHAR_FREQ_MAP
      toneMaps._32C_TONE_MAP
      toneMaps._4T_TONE_MAP
      toneMaps.MIN_TONE_FREQ
      toneMaps.MAX_TONE_FREQ

      */

// calculate max tone frequency
const maximumToneFreq = MIN_TONE_FREQ + BANDWIDTH;
// declare the end of line tone
const END_OF_LINE = toneMaps.CHAR_FREQ_MAP.EOL;
// declare max tone frequency
const MAX_TONE_FREQ = toneMaps.MAX_TONE_FREQ;
// number of colours
const NUM_COLORS = 32;
// declare calibration tones and maps, and other claculated variables
const CALIBRATION_TONE_MIN = toneMaps.MIN_TONE_FREQ // Hz
const CALIBRATION_TONE_MAX = toneMaps.MAX_TONE_FREQ // Hz
const _4T_TONE_MAP = toneMaps._4T_TONE_MAP;
const _32C_TONE_MAP = toneMaps._32C_TONE_MAP;
const CHAR_FREQ_MAP = toneMaps.CHAR_FREQ_MAP;
const RX_SNAP_THRESHOLD = BANDWIDTH / 85; // frequency snap threshold, when snapping to closest known frequency
const RX_CALIBRATION_DRIFT = BANDWIDTH / 7; // Snap threshold for calibration tone to be reconised as a calibration tone

/// Synchronization: Frequency that transmissions can be made in MINUTES
const PROCESSING_INTERVAL = Math.ceil(
    (
        (TONE_DURATION * 1024 * (FEC ? FEC_BD_REPEAT : 1)) +
        (HEADER_TONE_DURATION * FEC_HD_REPEAT * MAX_CHAR_HEADER) +
        7500
    ) / (1000 * 60)
);

console.log((
    (TONE_DURATION * 1024 * (FEC ? FEC_BD_REPEAT : 1)) +
    (HEADER_TONE_DURATION * FEC_HD_REPEAT * MAX_CHAR_HEADER) +
    7500
) / (1000 * 60))

console.log('PROCESSING_INTERVAL:', PROCESSING_INTERVAL);


// Helper functions
function generateToneMaps(MIN_TONE_FREQ, BANDWIDTH) {
    const reservedCalibrationBandwidth = BANDWIDTH / 7; // Reserve 50 Hz at each end for calibration
    const availableBandwidth = BANDWIDTH - reservedCalibrationBandwidth; // Usable bandwidth
    const stepSize = availableBandwidth / 39; // Calculate step size for 38 tones plus EOL tone.

    const charFrequencyMap = {};
    const tone32CMap = [];
    const tone4TMap = [];

    // Generating RX_CHAR_FREQ_MAP
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ';
    for (let i = 0; i < characters.length; i++) {
        charFrequencyMap[characters[i]] = Math.round(MIN_TONE_FREQ + (i * stepSize));
    }
    charFrequencyMap['EOL'] = Math.round(MIN_TONE_FREQ + (characters.length * stepSize)); // Special end-of-line tone

    // Generating RX_32C_TONE_MAP
    for (let i = 0; i < 32; i++) {
        tone32CMap.push(Math.round(MIN_TONE_FREQ + (i * stepSize)));
    }

    // Generating RX_4T_TONE_MAP (every 8th tone from RX_32C_TONE_MAP)
    for (let i = 0; i < 4; i++) {
        tone4TMap.push(Math.round(tone32CMap[i * 8]));
    }

    return {
        CHAR_FREQ_MAP: charFrequencyMap,
        _32C_TONE_MAP: tone32CMap,
        _4T_TONE_MAP: tone4TMap,
        MIN_TONE_FREQ: Math.round(MIN_TONE_FREQ),
        MAX_TONE_FREQ: Math.round(MIN_TONE_FREQ + BANDWIDTH),
        StepSize: stepSize
    };
}

console.log("modulation specification:", toneMaps, END_OF_LINE);

