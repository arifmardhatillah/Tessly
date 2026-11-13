const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('get-data'),
  onData: (cb) => ipcRenderer.on('data', (_e, d) => cb(d)), // dikirim begitu log berubah
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  setLang: (l) => ipcRenderer.invoke('set-lang', l),
  update: {
    get: () => ipcRenderer.invoke('update-get'),
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    install: () => ipcRenderer.invoke('update-install'),
    onState: (cb) => ipcRenderer.on('update-state', (_e, st) => cb(st)),
  },
});
