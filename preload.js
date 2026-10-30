const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { pathToFileURL } = require('url');
contextBridge.exposeInMainWorld('api', {
  version: () => ipcRenderer.invoke('version'),
  pickFile: multi => ipcRenderer.invoke('pick-file', !!multi),
  pathForFile: f => webUtils.getPathForFile(f),
  fileUrl: p => pathToFileURL(p).href,
  saveRecording: data => ipcRenderer.invoke('save-recording', data),
  deleteTemp: p => ipcRenderer.invoke('delete-temp', p),
  process: (kind, inputs, format, quality) => ipcRenderer.invoke('process', { kind, inputs, format, quality }),
  save: kind => ipcRenderer.invoke('save', kind),
  reveal: p => ipcRenderer.invoke('reveal', p),
  onProgress: cb => ipcRenderer.on('progress', (_e, t) => cb(t)),
});
