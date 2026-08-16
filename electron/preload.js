const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC bridge to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
    setStreamStatus: (active) => ipcRenderer.send('set-stream-status', active),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    openKickWindow: (username) => ipcRenderer.send('open-kick-window', username),
    platform: process.platform,
    isElectron: true,
});

// Mark document so CSS can style for Electron context.
// <html> has suppressHydrationWarning in the root layout to cover these classes.
const markDocument = () => {
    document.documentElement.classList.add('electron');
    if (process.platform === 'darwin') {
        document.documentElement.classList.add('electron-mac');
    }
};

// documentElement is usually there already; if not, wait for the DOM
if (document.documentElement) {
    markDocument();
} else {
    window.addEventListener('DOMContentLoaded', markDocument);
}
