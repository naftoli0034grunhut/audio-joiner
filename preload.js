const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  version: () => ipcRenderer.invoke('version'),
  pickFile: multi => ipcRenderer.invoke('pick-file', !!multi),
  pathForFile: f => webUtils.getPathForFile(f),
  process: (kind, inputs, format) => ipcRenderer.invoke('process', { kind, inputs, format }),
  save: kind => ipcRenderer.invoke('save', kind),
  reveal: p => ipcRenderer.invoke('reveal', p),
  onProgress: cb => ipcRenderer.on('progress', (_e, t) => cb(t)),
});
