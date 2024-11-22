// ipc renderer invoked elsewher

window.addEventListener('DOMContentLoaded', async () => {

    // Modal Elements
    const settingsIcon = document.getElementById("settings-icon");
    const rxSettingsModal = document.getElementById("rx-settings-modal");
    const bandpassToggle = document.getElementById("bandpass-toggle");
    const compressionToggle = document.getElementById("compression-toggle");
    const amplitudeThresholdInput = document.getElementById("amplitude-threshold");
    const saveSettingsButton = document.getElementById("save-settings");
    const closeSettingsButton = document.getElementById("close-settings");

// Show Modal
settingsIcon.addEventListener("click", () => {
    // Populate the modal with current settings
    bandpassToggle.checked = RX_BANDPASS_STATE;
    compressionToggle.checked = RX_COMPRESSOR_STATE;
    amplitudeThresholdInput.value = RX_AMPLITUDE_THRESHOLD_DB;

    // Display the modal
    rxSettingsModal.style.display = "block";
});

// Hide Modal
function closeSettingsModal() {
    rxSettingsModal.style.display = "none";
}

closeSettingsButton.addEventListener("click", closeSettingsModal);


    try {
        // Load receive preferences and populate fields
        const receivePreferences = await ipcRenderer.invoke('load-receive-preferences');
        document.getElementById('bandpass-toggle').checked = receivePreferences.RX_BANDPASS_STATE || false;
        document.getElementById('compression-toggle').checked = receivePreferences.RX_COMPRESSOR_STATE || false;
        document.getElementById('amplitude-threshold').value = receivePreferences.RX_AMPLITUDE_THRESHOLD_DB || -60;

        // Save preferences on click
        document.getElementById('save-settings').addEventListener('click', async () => {
            try {
                // Get updated preferences from the form
                const amplitudeThresholdInput = document.getElementById('amplitude-threshold').value;
                const amplitudeThreshold = parseFloat(amplitudeThresholdInput);

                // Validate amplitude threshold
                if (isNaN(amplitudeThreshold)) {
                    alert('Amplitude Threshold must be a valid number.');
                    return;
                }

                const updatedReceivePreferences = {
                    RX_BANDPASS_STATE: document.getElementById('bandpass-toggle').checked,
                    RX_COMPRESSOR_STATE: document.getElementById('compression-toggle').checked,
                    RX_AMPLITUDE_THRESHOLD_DB: amplitudeThreshold,
                };

                // Save updated preferences
                await ipcRenderer.invoke('save-receive-preferences', updatedReceivePreferences);
                addToLog('Preferences saved successfully!');
                closeSettingsModal()
            } catch (error) {
                console.error('Error saving preferences:', error);
                alert('Failed to save preferences. Please try again.');
            }
        });

        // Close window without saving on cancel
        document.getElementById('close-settings').addEventListener('click', () => {
            closeSettingsModal()
        });
    } catch (error) {
        console.error('Error loading preferences:', error);
        alert('Failed to load preferences. Please try again.');
    }
});
