const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { mergeFiles } = require('./merge');

let win;
let tempFile = null;

function createWindow() {
  win = new BrowserWindow({
    width: 740, height: 820, minWidth: 580, minHeight: 640,
    title: 'Audio Joiner', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile('index.html');
}

function cleanTemp() {
  if (tempFile) { try { fs.unlinkSync(tempFile); } catch (_) {} tempFile = null; }
}

ipcMain.handle('pick-file', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose audio file(s)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'wma', 'opus', 'aiff'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return r.canceled ? [] : r.filePaths.map(p => ({ path: p, name: path.basename(p) }));
});

// Join into a temporary file so it can be previewed before saving.
ipcMain.handle('merge', async (_e, { inputs, format }) => {
  cleanTemp();
  const out = path.join(os.tmpdir(), `audio-joiner-${Date.now()}.${format}`);
  try {
    await mergeFiles(inputs, out, t => win.webContents.send('progress', t));
    tempFile = out;
    return { ok: true, url: pathToFileURL(out).href, format };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('save', async () => {
  if (!tempFile) return { ok: false, error: 'Nothing to save yet.' };
  const ext = path.extname(tempFile).slice(1);
  const r = await dialog.showSaveDialog(win, {
    title: 'Save joined file as',
    defaultPath: 'joined.' + ext,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled) return { canceled: true };
  try { fs.copyFileSync(tempFile, r.filePath); return { ok: true, path: r.filePath }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(createWindow);
app.on('will-quit', cleanTemp);
app.on('window-all-closed', () => app.quit());
