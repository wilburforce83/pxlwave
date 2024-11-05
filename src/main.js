const { app, BrowserWindow, Menu, ipcMain, dialog, systemPreferences } = require('electron');
const path = require('path');
// Disable hardware acceleration to prevent GPU-related errors
app.disableHardwareAcceleration();

let mainWindow;
let yourCardsWindow;

async function setupElectronStore() {
    const { default: Store } = await import('electron-store');
    return new Store();
}

async function createMainWindow() {
    const store = await setupElectronStore();

    mainWindow = new BrowserWindow({
        width: 1260,
        height: 740,
        resizable: false,
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
        width: 800,
        height: 800,
        backgroundColor: '#1e1e1e',
        parent: mainWindow,
        resizable: true,
        modal: false,
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        },
    });

    yourCardsWindow.loadFile(path.join(__dirname, '../public/yourCards.html'));
    yourCardsWindow.once('ready-to-show', () => {
        yourCardsWindow.show();
        yourCardsWindow.webContents.openDevTools({ mode: 'detach' });
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

// Application Menu
const menuTemplate = [
    {
        label: 'File',
        submenu: [
            { role: 'quit' },
        ],
    },
    {
        label: 'View',
        submenu: [
            {
                label: 'Your Cards',
                click: createYourCardsWindow,
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

// COLLECTION HANDLERS

// Handle loading all received images (collection)
ipcMain.handle('load-collection', async () => {
    const store = await setupElectronStore();
    return store.get('collection') || []; // Return all received images
});

// Handle saving a received image to the collection
ipcMain.handle('save-to-collection', async (event, receivedData) => {
    const store = await setupElectronStore();
    const collection = store.get('collection', []); // Get existing collection
    receivedData.id = new Date().getTime(); // Generate a unique ID based on timestamp
    collection.push(receivedData); // Add the new received image
    store.set('collection', collection); // Save the updated collection
    return { status: 'success', message: 'Image saved successfully!' };
});

// Handle deleting an image from the collection
ipcMain.handle('delete-from-collection', async (event, imageId) => {
    const store = await setupElectronStore();
    const collection = store.get('collection', []); // Get the existing collection

    const updatedCollection = collection.filter(image => image.id !== imageId); // Only keep images that do not match the id

    // Only update the store if there was a change
    if (collection.length !== updatedCollection.length) {
        store.set('collection', updatedCollection); // Save the updated list back to the store
        return { status: 'success', message: 'Image deleted successfully!' };
    } else {
        return { status: 'error', message: 'Image not found!' };
    }
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
