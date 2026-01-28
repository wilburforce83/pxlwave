# PiQSL

PiQSL is an Electron-based desktop app for a 32x32 pixel-art digital mode over HF audio. It turns small pixel images into tone sequences, schedules them on fixed transmit intervals, and decodes them back into images on the receive side. The UI also includes a “card” concept for managing your own pixel cards and a collection of received contacts.

## Quick start

```bash
npm install
npm start
```

## Requirements

- Node.js + npm
- A microphone input device
- An audio output device
- On macOS, the app requests microphone and camera permissions at launch (see `src/main.js`).
- Optional: QRZ credentials for callsign metadata and distance calculation.

## What it does

- **32x32 pixel-art TX/RX** over audio tones using a fixed 32‑color palette (with an optional 4‑tone grayscale mode).
- **Scheduled transmissions** aligned to a computed processing interval (see `PROCESSING_INTERVAL` in `src/utils/tuning.js`).
- **Waterfall + amplitude view** for visualizing the audio spectrum during RX.
- **Card management** for your own image cards and received contacts.
- **QRZ integration** (optional) to fetch callsign metadata and calculate distance.

## How it works (high level)

1. **Image import → 32x32 palette**
   - Images are resized to 32x32 and quantized to the 32‑color palette in `src/utils/piqslConv.js`.

2. **TX encoding**
   - TX uses a fixed header: `SENDER-RECIPIENT-MODE`, padded to `MAX_CHAR_HEADER` (17 chars).
   - Two calibration tones (min + max) are transmitted before the header.
   - Header tones are repeated for FEC (`FEC_HD_REPEAT`, default 5).
   - Each image line is repeated for FEC (`FEC_BD_REPEAT`, default 4).
   - Tone maps are generated from `MIN_TONE_FREQ` and `BANDWIDTH` in `src/utils/tuning.js`.

3. **TX playback**
   - The tone sequence is precompiled into an audio buffer and played through the selected output device.
   - TX starts on the next scheduling boundary (+7 seconds into the interval by default).

4. **RX decoding**
   - Microphone samples are windowed and processed with Goertzel in a worker thread.
   - The header is decoded by majority vote over repeated tones.
   - Image tones are grouped by line and majority-voted across repeats to reconstruct the 32x32 grid.
   - The image is rendered and saved as a “contact.”

## App pages

- **Main (TX/RX/Log)**: `public/index.html`
  - TX panel: select devices, callsigns, mode, and gain.
  - RX panel: decoded header info, RX image preview, waterfall.
  - Log panel: timestamped activity.

- **Your Cards**: `public/yourCards.html`
  - Import and convert images to the 32‑color palette.
  - Save cards locally for TX selection.

- **Contacts**: `public/contacts.html`
  - Tabular view of received contacts with thumbnails.

- **Collections**: `public/collections.html`
  - Gallery-style card view for received contacts.

- **Preferences**: `public/preferences.html`
  - Callsign, QRZ credentials, location, units.

## Configuration and tuning

Most modulation-related parameters live in `src/utils/tuning.js`:

- **Frequencies:** `MIN_TONE_FREQ`, `BANDWIDTH`, tone maps
- **Timing:** `TONE_DURATION`, `HEADER_TONE_DURATION`, `CALIBRATION_TONE_DURATION`
- **FEC:** `FEC`, `FEC_HD_REPEAT`, `FEC_BD_REPEAT`
- **RX settings:** `FFT_SIZE`, `RX_ANALYSIS_INTERVAL`, `RX_BANDPASS_STATE`, `RX_COMPRESSOR_STATE`

`PROCESSING_INTERVAL` is computed from the above to schedule TX/RX windows.

## Data storage

The app uses `electron-store` to persist data locally. Keys include:

- `cards`: saved TX images (grid data + metadata)
- `contacts`: received contacts with rendered image, SNR, grading, etc.
- `preferences`: callsign, QRZ credentials, grid, coordinates
- `receivePreferences`: RX settings toggles

Electron Store uses your OS app‑data directory (typical locations):

- macOS: `~/Library/Application Support/PiQSL`
- Windows: `%APPDATA%\\PiQSL`
- Linux: `~/.config/PiQSL`

## Development notes

- The Electron main process is in `src/main.js`.
- Renderer scripts live under `src/utils`, `src/TX`, `src/RX`, and `src/pages`.
- Worker threads are used for TX scheduling/encoding and RX Goertzel processing.
- There is a `build` config in `package.json`, but no packaging script is defined yet.

## Troubleshooting

- **No audio devices listed:** Verify OS permissions, then restart the app.
- **RX not decoding:** Check waterfall activity and input levels; verify that TX and RX intervals match the same timing scheme.
- **QRZ errors:** Confirm credentials and network access.

## License

GPL‑3.0 (see `LICENSE`).
