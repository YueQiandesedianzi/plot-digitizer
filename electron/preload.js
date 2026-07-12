const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plotDigitizer', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (input) => ipcRenderer.invoke('project:save', input)
});
