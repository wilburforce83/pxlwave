const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let activeRecordingDeviceId = null;
let activePlaybackDeviceId = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1260,
        height: 680,
        resize: false,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: path.join(__dirname, 'ui.js'),
            contextIsolation: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, '../public/index.html'));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// Handle device selection messages
ipcMain.on('set-recording-device', (event, deviceId) => {
    activeRecordingDeviceId = deviceId;
    console.log('Selected recording device:', activeRecordingDeviceId);
});

ipcMain.on('set-playback-device', (event, deviceId) => {
    activePlaybackDeviceId = deviceId;
    console.log('Selected playback device:', activePlaybackDeviceId);
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
