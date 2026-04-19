const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC bridge to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
    setStreamStatus: (active) => ipcRenderer.send('set-stream-status', active),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    openKickWindow: (username) => ipcRenderer.send('open-kick-window', username),
    platform: process.platform,
    isElectron: true,
});

// Mark document so CSS can style for Electron context
window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('electron');
    if (process.platform === 'darwin') {
        document.documentElement.classList.add('electron-mac');
    }
});
