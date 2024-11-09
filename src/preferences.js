const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', async () => {
    // Load preferences and populate fields
    const preferences = await ipcRenderer.invoke('load-preferences');
    document.getElementById('callsign').value = preferences.callsign;
    document.getElementById('qrzUsername').value = preferences.qrzUsername;
    document.getElementById('qrzPassword').value = preferences.qrzPassword;
    document.getElementById('maidenheadGrid').value = preferences.maidenheadGrid;
    document.getElementById('units').value = preferences.units;

    // Save preferences on click
    document.getElementById('save-btn').addEventListener('click', async () => {
        const updatedPreferences = {
            callsign: document.getElementById('callsign').value,
            connectToQRZ: true,
            qrzUsername: document.getElementById('qrzUsername').value,
            qrzPassword: document.getElementById('qrzPassword').value,
            maidenheadGrid: document.getElementById('maidenheadGrid').value,
            units: document.getElementById('units').value,
        };

        await ipcRenderer.invoke('save-preferences', updatedPreferences);
        window.close();
    });

    // Close window without saving on cancel
    document.getElementById('cancel-btn').addEventListener('click', () => {
        window.close();
    });
});
