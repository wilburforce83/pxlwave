# Codebase and Design Notes

This document is a deeper, developer‑focused recap of the PiQSL codebase, architecture, and design intent. It is meant to help you re‑orient after time away.

## 1) Runtime architecture

PiQSL is a single‑process Electron app with renderer windows and worker threads:

- **Main process**: `src/main.js`
  - Creates the main window and helper windows (Your Cards, Contacts, Collections, Preferences).
  - Defines IPC handlers for reading/writing cards, contacts, and preferences using `electron-store`.
  - Requests microphone/camera permissions on macOS.

- **Renderer (main UI)**: `public/index.html` + scripts under `src/utils`, `src/TX`, `src/RX`
  - UI is a 3‑column layout (TX / RX / Log).
  - Uses `tuning.js` to define modulation constants and generate tone maps.
  - Uses `piqslConv.js` to render and convert 32x32 pixel grids.

- **Worker threads**:
  - `src/TX/TX_worker.js`: generates tone sequences and computes the next TX interval.
  - `src/RX/RX_worker.js`: Goertzel analysis for frequency detection and SNR estimation.

- **Additional windows/pages**:
  - `public/yourCards.html` + `src/pages/yourCards.js`: import and save TX cards.
  - `public/contacts.html`: table view of received contacts.
  - `public/collections.html` + `src/pages/collections.js`: gallery‑style contact cards.
  - `public/preferences.html` + `src/pages/preferences.js`: user preferences.

## 2) UI layout and flow

Main window (`public/index.html`):

- **TX panel (left)**
  - Image preview (click to select a saved card)
  - Device selectors (input/output)
  - Callsign fields and mode selection
  - TX gain slider and “Transmit” button

- **RX panel (center)**
  - Header decode fields (sender/recipient/mode/distance)
  - RX image preview canvas
  - Waterfall plot and amplitude overlay

- **Log panel (right)**
  - Timestamped log with color‑coded categories

The UI uses a dark theme with monospace fonts (`public/styles.css`) and additional card styling in `public/cards.css`.

## 3) Modulation and signal design

All modulation parameters live in `src/utils/tuning.js`:

- **Frequency range**:
  - `MIN_TONE_FREQ` + `BANDWIDTH` define the usable spectrum window.
  - Tone maps are generated from this range.

- **Tone maps**:
  - `CHAR_FREQ_MAP`: A‑Z, 0‑9, dash, space.
  - `_32C_TONE_MAP`: 32 tone slots for the color palette.
  - `_4T_TONE_MAP`: 4 tone slots for grayscale mode.

- **Timing**:
  - `TONE_DURATION` for image tones.
  - `HEADER_TONE_DURATION` for header tones.
  - `CALIBRATION_TONE_DURATION` for min/max calibration.

- **FEC**:
  - `FEC_HD_REPEAT` repeats the header.
  - `FEC_BD_REPEAT` repeats each image line.

- **Scheduling**:
  - `PROCESSING_INTERVAL` is computed from total TX duration.
  - TX aligns to the next interval and starts at +7 seconds.
  - RX starts at `RX_startTime` seconds after the minute.

## 4) Transmission (TX) pipeline

Files: `src/TX/transmit.js`, `src/TX/TX_worker.js`

1. **User selects a card** (grid data) and callsigns.
2. **Transmission scheduled** for the next interval boundary.
3. **Worker generates tone sequence**:
   - Min calibration tone
   - Max calibration tone
   - Header string: `SENDER-RECIPIENT-MODE`, padded to 17 chars
   - Header repeated for FEC
   - Image data encoded line by line, repeated for FEC
4. **Renderer precompiles audio buffer** from the tone sequence.
   - Applies a short envelope using `GAP_DURATION` to avoid clicks.
5. **Playback** uses an `AudioContext` and a `MediaStreamDestination` to route audio to the selected output device (`setSinkId`).

## 5) Receive (RX) pipeline

Files: `src/RX/receive.js`, `src/RX/RX_worker.js`, `src/RX/decodeHeader.js`, `src/RX/decodeImage.js`

1. **Listening window** is scheduled by interval timing.
2. **Audio chain**: Gain adjustment -> optional bandpass -> optional compressor -> analyser.
3. **Sampling loop** sends short windows to the RX worker.
4. **RX worker**:
   - Goertzel on all expected tones.
   - Dynamic thresholding and SNR calculation.
5. **Header decode**:
   - Finds the datum (calibration max tone).
   - Groups tones by header positions.
   - Majority vote across repetitions.
6. **Image decode**:
   - Frequencies are grouped into tone windows.
   - Color indices determined by nearest tone.
   - Repeated lines are majority‑voted to produce final pixels.
7. **Render + save**:
   - Canvas render on the main UI.
   - Contact metadata enriched via QRZ and geocoding.
   - Contact saved to `electron-store`.

## 6) Data model

### Cards (TX designs)

Stored in `electron-store` under `cards`:

```js
{
  id: Number,           // Date.now()
  gridData: Number[1024],
  callsign: String,
  description: String
}
```

### Contacts (RX results)

Stored under `contacts` (based on `src/RX/contactData.js` and `decodeImage.js`):

```js
{
  callsign: String,
  fname: String,
  name: String,
  directContact: Boolean,
  addr2: String,
  country: String,
  coordinates: { lat, lon },
  timeStamp: Date,
  distanceKM: Number,
  gridData: Number[1024],
  image: String,        // base64
  errorCount: Number,
  snr: Number,
  grading: {
    qualityScore: Number,
    snrScore: Number,
    distanceScore: Number,
    totalScore: Number,
    grade: String
  }
}
```

## 7) Storage and IPC

- `src/main.js` defines IPC handlers for:
  - `save-card`, `load-cards`, `get-cards`, `delete-card`
  - `save-contact`, `load-contact`
  - `save-preferences`, `load-preferences`
  - `save-receive-preferences`, `load-receive-preferences`

Electron Store persists all of the above under the app’s OS‑specific data directory.

## 8) External services

- **QRZ XML API**: callsign lookup in `src/utils/qrzConnection.js`.
- **Nominatim (OpenStreetMap)**: geocoding for distance calculations.

These are optional; the app continues if credentials are missing.

## 9) Build and distribution

- `package.json` has a `build` section with platform icon config.
- There is no packaging script in `scripts` yet (only `npm start`).

## 10) Design intent

PiQSL blends the feel of ham‑radio digital modes with a collectible‑card motif:

- **“Cards”**: 32x32 pixel images act as the payload.
- **“Contacts”**: received payloads are scored (quality/SNR/distance) and shown as collectible cards.
- **UI emphasis**: simple panels for operational flow and a dedicated collection/gallery experience.

## 11) Areas to revisit (tech‑debt snapshot)

These are based on the current source and are good candidates for a future cleanup pass:

- Consolidate palette/tone logic and reduce duplicate rendering helpers.
- Consider moving shared globals (preferences, contact data) into an explicit state module.
- Add a test harness (even a small signal‑chain smoke test) to validate encode/decode changes.
- Evaluate Electron security hardening if you plan to distribute widely.
