const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

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
        height: 680,
        resizable: false,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: path.join(__dirname, 'ui.js'),
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
        modal: true,
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


