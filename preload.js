const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  pickFile: () => ipcRenderer.invoke('pick-file'),
  pathForFile: f => webUtils.getPathForFile(f),
  merge: (inputs, format) => ipcRenderer.invoke('merge', { inputs, format }),
  save: () => ipcRenderer.invoke('save'),
  reveal: p => ipcRenderer.invoke('reveal', p),
  onProgress: cb => ipcRenderer.on('progress', (_e, t) => cb(t)),
});
