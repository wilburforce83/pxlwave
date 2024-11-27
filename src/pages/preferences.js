const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', async () => {
    // Load preferences and populate fields
    const preferences = await ipcRenderer.invoke('load-preferences');
    document.getElementById('callsign').value = preferences.callsign;
    document.getElementById('qrzUsername').value = preferences.qrzUsername;
    document.getElementById('qrzPassword').value = preferences.qrzPassword;
    document.getElementById('lon').value = preferences.lon;
    document.getElementById('lat').value = preferences.lat;
    document.getElementById('maidenheadGrid').value = preferences.maidenheadGrid;
    document.getElementById('units').value = preferences.units;

    // Save preferences on click
    document.getElementById('save-btn').addEventListener('click', async () => {
        const updatedPreferences = {
            callsign: document.getElementById('callsign').value,
            connectToQRZ: true,
            qrzUsername: document.getElementById('qrzUsername').value,
            qrzPassword: document.getElementById('qrzPassword').value,
            lon: document.getElementById('lon').value,
            lat: document.getElementById('lat').value,
            maidenheadGrid: document.getElementById('maidenheadGrid').value,
            units: document.getElementById('units').value,
        };

        // Only include keys with valid values
        Object.keys(updatedPreferences).forEach(key => {
            if (updatedPreferences[key] === undefined || updatedPreferences[key] === null || updatedPreferences[key] === '') {
                delete updatedPreferences[key];
            }
        });

        await ipcRenderer.invoke('save-preferences', updatedPreferences);
        window.close();
    });

    // Close window without saving on cancel
    document.getElementById('cancel-btn').addEventListener('click', () => {
        window.close();
    });
});
