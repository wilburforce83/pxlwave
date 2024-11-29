const { app, BrowserWindow, Menu, ipcMain, dialog, systemPreferences } = require('electron');
const path = require('path');
// Disable hardware acceleration to prevent GPU-related errors
app.disableHardwareAcceleration();

let mainWindow;
let yourCardsWindow;
let preferencesWindow;

async function setupElectronStore() {
    const { default: Store } = await import('electron-store');
    return new Store();
}

async function createMainWindow() {
    const store = await setupElectronStore();

    mainWindow = new BrowserWindow({
        width: 1240,
        height: 660,
        resizable: false,
        icon: path.join(__dirname, 'icons/app-icon.png'), // For Linux or generic setup
        backgroundColor: '#1e1e1e',
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, '../public/index.html'));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
}

async function createYourCardsWindow() {
    yourCardsWindow = new BrowserWindow({
        width: 770,
        height: 625,
        backgroundColor: '#1e1e1e',
        parent: mainWindow,
        resizable: false,
        modal: false,
        icon: path.join(__dirname, 'icons/app-icon.png'), // For Linux or generic setup
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        },
    });

    yourCardsWindow.loadFile(path.join(__dirname, '../public/yourCards.html'));
    yourCardsWindow.once('ready-to-show', () => {
        yourCardsWindow.show();
      //  yourCardsWindow.webContents.openDevTools({ mode: 'detach' });
    });

    // Add a menu only if not on Windows
    if (process.platform !== 'win32') {
        const menuTemplate = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Quit',
                        accelerator: 'CmdOrCtrl+Q',
                        click: () => {
                            yourCardsWindow.close();
                        }
                    }
                ]
            }
        ];
        const menu = Menu.buildFromTemplate(menuTemplate);
        yourCardsWindow.setMenu(menu); // Set the menu for macOS/Linux
    } else {
        yourCardsWindow.setMenu(null); // Remove the menu for Windows
    }

    yourCardsWindow.on('closed', () => {
        yourCardsWindow = null;
    });
}

async function createContactsWindow() {
    contactsWindow = new BrowserWindow({
        width: 1240,
        height: 600,
        backgroundColor: '#1e1e1e',
        parent: mainWindow,
        resizable: false,
        icon: path.join(__dirname, 'icons/app-icon.png'),
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        },
    });

    contactsWindow.loadFile(path.join(__dirname, '../public/contacts.html'));
    contactsWindow.webContents.openDevTools({ mode: 'detach' });
    contactsWindow.once('ready-to-show', () => {
        contactsWindow.show();
    });

    if (process.platform !== 'win32') {
        const menuTemplate = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Quit',
                        accelerator: 'CmdOrCtrl+Q',
                        click: () => {
                            contactsWindow.close();
                        }
                    }
                ]
            }
        ];
        const menu = Menu.buildFromTemplate(menuTemplate);
        contactsWindow.setMenu(menu);
    } else {
        contactsWindow.setMenu(null);
    }

    contactsWindow.on('closed', () => {
        contactsWindow = null;
    });
}


async function createCollectionsWindow() {
    collectionsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: '#1e1e1e',
        parent: mainWindow,
        resizable: false,
        icon: path.join(__dirname, 'icons/app-icon.png'),
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        },
    });

    collectionsWindow.loadFile(path.join(__dirname, '../public/collections.html'));
    collectionsWindow.webContents.openDevTools({ mode: 'detach' });
    collectionsWindow.once('ready-to-show', () => {
        collectionsWindow.show();
    });

    if (process.platform !== 'win32') {
        const menuTemplate = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Quit',
                        accelerator: 'CmdOrCtrl+Q',
                        click: () => {
                            collectionsWindow.close();
                        }
                    }
                ]
            }
        ];
        const menu = Menu.buildFromTemplate(menuTemplate);
        collectionsWindow.setMenu(menu);
    } else {
        collectionsWindow.setMenu(null);
    }

    collectionsWindow.on('closed', () => {
        collectionsWindow = null;
    });
}


async function createPreferencesWindow() {
    preferencesWindow = new BrowserWindow({
        width: 650,
        height: 380,
        backgroundColor: '#1e1e1e',
        parent: mainWindow,
        resizable: false,
        modal: true,
        icon: path.join(__dirname, 'icons/app-icon.png'),
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        },
    });

    preferencesWindow.loadFile(path.join(__dirname, '../public/preferences.html'));
    preferencesWindow.once('ready-to-show', () => {
        preferencesWindow.show();
    });

    preferencesWindow.setMenu(null); // No menu or toolbar

    preferencesWindow.on('closed', () => {
        preferencesWindow = null;
    });
}

// Application Menu
const menuTemplate = [
    {
        label: 'File',
        submenu: [
            {
                label: 'Preferences',
                click: createPreferencesWindow,
            },
            { role: 'quit' },
        ],
    },
    {
        label: 'Manage',
        submenu: [
            {
                label: 'Your Cards',
                click: createYourCardsWindow,
            },
            {
                label: 'Contacts',
                click: createContactsWindow,
            },
            {
                label: 'Collections',
                click: createCollectionsWindow,
            },
        ],
    },
];

const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);


app.on('ready', createMainWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// Handle the file selection event
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
        properties: ['openFile']
    });

    if (result.canceled) return null;
    return result.filePaths[0]; // Return the selected file path
});

// Handle saving card data
ipcMain.handle('save-card', async (event, cardData) => {
    const store = await setupElectronStore();
    const cards = store.get('cards', []); // Get existing cards or initialize an empty array
    cards.push(cardData); // Add the new card data
    store.set('cards', cards); // Save the updated array back to the store
    return 'Card saved successfully!';
});

// Handle loading all saved cards
ipcMain.handle('load-cards', async () => {
    const store = await setupElectronStore();
    return store.get('cards') || []; // Return all saved cards from the store
});

// Handle retrieving card data
ipcMain.handle('get-cards', async () => {
    const store = await setupElectronStore();
    return store.get('cards', []); // Return the list of saved cards
});

// Handle deleting a card
ipcMain.handle('delete-card', async (event, cardId) => {
    const store = await setupElectronStore();
    const cards = store.get('cards', []); // Get the existing cards

    // Check if the cardId is valid
    const updatedCards = cards.filter(card => card.id !== cardId); // Only keep cards that do not match the id

    // Only update the store if there was a change
    if (cards.length !== updatedCards.length) {
        store.set('cards', updatedCards); // Save the updated list back to the store
        return { status: 'success', message: 'Card deleted successfully!' };
    } else {
        return { status: 'error', message: 'Card not found!' };
    }
});


// RECEIVE PREFERENCES:

ipcMain.handle('load-receive-preferences', async () => {
    const store = await setupElectronStore(); // Initialize store here
    return store.get('receivePreferences', {
        RX_BANDPASS_STATE: true,
        RX_COMPRESSOR_STATE: true,
        RX_AMPLITUDE_THRESHOLD_DB: -75,
    });
});

ipcMain.handle('save-receive-preferences', async (event, preferences) => {
    const store = await setupElectronStore(); // Initialize store here
    store.set('receivePreferences', preferences);
    return { status: 'success', message: 'Preferences saved successfully!' };
});

// COLLECTION HANDLERS

// Handle saving card data
ipcMain.handle('save-contact', async (event, contact) => {
    const store = await setupElectronStore();
    const contacts = store.get('contacts', []); // Get existing cards or initialize an empty array
    contacts.push(contact); // Add the new card data
    store.set('contacts', contacts); // Save the updated array back to the store
    return 'Card saved successfully!';
});

// Handle loading all saved cards
ipcMain.handle('load-contact', async () => {
    const store = await setupElectronStore();
    return store.get('contacts') || []; // Return all saved cards from the store
});





// Check if the operating system is macOS
if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').then(granted => {
        if (granted) {
            console.log('Microphone access granted');
        } else {
            console.log('Microphone access denied');
        }
    });

    systemPreferences.askForMediaAccess('camera').then(granted => {
        if (granted) {
            console.log('Camera access granted');
        } else {
            console.log('Camera access denied');
        }
    });
}

// Handle saving and loading preferences
ipcMain.handle('load-preferences', async () => {
    const store = await setupElectronStore();
    return {
        callsign: store.get('callsign', ''),
        connectToQRZ: store.get('connectToQRZ', false),
        qrzUsername: store.get('qrzUsername', ''),
        qrzPassword: store.get('qrzPassword', ''),
        maidenheadGrid: store.get('maidenheadGrid', ''),
        lon: store.get('lon', ''),
        lat: store.get('lat', ''),
        units: store.get('units', 'KM'),
    };
});

ipcMain.handle('save-preferences', async (event, preferences) => {
    const store = await setupElectronStore();
    try {
        // Set all preferences at once
        store.set(preferences);
        return 'Preferences saved successfully!';
    } catch (error) {
        console.error("Error saving preferences:", error);
        throw error;
    }
});
