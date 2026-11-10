const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('get-data'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  testConnection: (s) => ipcRenderer.invoke('test-connection', s),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  removeMachine: (id) => ipcRenderer.invoke('remove-machine', id),
  onUpdated: (cb) => ipcRenderer.on('updated', () => cb()),
  update: {
    get: () => ipcRenderer.invoke('update-get'),
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    install: () => ipcRenderer.invoke('update-install'),
    onState: (cb) => ipcRenderer.on('update-state', (_e, st) => cb(st)),
  },
});
