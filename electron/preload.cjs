const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ultraconnectDesktop', {
  toggleFullscreen: () => ipcRenderer.invoke('ultraconnect:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('ultraconnect:is-fullscreen'),
  update: () => ipcRenderer.invoke('ultraconnect:update'),
});
