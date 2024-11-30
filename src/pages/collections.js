const { ipcRenderer } = require('electron');

let cardData;

function LoadContacts() {
    ipcRenderer.invoke('load-contact')
        .then(result => {
            // Handle the result here
           // console.log('Save result:', result);
           cardData = result;
        })
        .catch(error => {
            // Handle any errors here
            console.error('Error saving card:', error);
        });
}

LoadContacts();