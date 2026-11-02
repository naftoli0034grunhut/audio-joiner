const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  version: () => ipcRenderer.invoke('version'),
  pickFile: multi => ipcRenderer.invoke('pick-file', !!multi),
  pathForFile: f => webUtils.getPathForFile(f),
  readFile: p => ipcRenderer.invoke('read-file', p),
  saveRecording: data => ipcRenderer.invoke('save-recording', data),
  deleteTemp: p => ipcRenderer.invoke('delete-temp', p),
  process: (kind, inputs, format, quality) => ipcRenderer.invoke('process', { kind, inputs, format, quality }),
  save: kind => ipcRenderer.invoke('save', kind),
  reveal: p => ipcRenderer.invoke('reveal', p),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getDefaultDir: () => ipcRenderer.invoke('get-default-dir'),
  openFolder: p => ipcRenderer.invoke('open-folder', p),
  convertBatch: opts => ipcRenderer.invoke('convert-batch', opts),
  onBatchProgress: cb => ipcRenderer.on('batch-progress', (_e, d) => cb(d)),
  onProgress: cb => ipcRenderer.on('progress', (_e, t) => cb(t)),
});
