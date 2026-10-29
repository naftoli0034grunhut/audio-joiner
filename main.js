const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { mergeFiles, convertFile } = require('./merge');

let win;
const tempFiles = { join: null, convert: null };

function createWindow() {
  win = new BrowserWindow({
    width: 920, height: 640, minWidth: 780, minHeight: 540,
    title: 'Audio Joiner', autoHideMenuBar: true, backgroundColor: '#f5f5f5',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile('index.html');
}

function cleanTemp(kind) {
  if (tempFiles[kind]) { try { fs.unlinkSync(tempFiles[kind]); } catch (_) {} tempFiles[kind] = null; }
}

// ---- running file number (saved on this PC, survives restarts) ----
const statePath = () => path.join(app.getPath('userData'), 'state.json');
function readState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (_) { return {}; } }
function writeState(s) { try { fs.writeFileSync(statePath(), JSON.stringify(s)); } catch (_) {} }
function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

ipcMain.handle('version', () => app.getVersion());

ipcMain.handle('pick-file', async (_e, multi) => {
  const r = await dialog.showOpenDialog(win, {
    title: multi ? 'Choose audio file(s)' : 'Choose an audio file',
    properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'wma', 'opus', 'aiff'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return r.canceled ? [] : r.filePaths.map(p => ({ path: p, name: path.basename(p) }));
});

// Create the result in a temp file so it can be previewed before saving.
ipcMain.handle('process', async (_e, { kind, inputs, format }) => {
  cleanTemp(kind);
  const out = path.join(os.tmpdir(), `audio-joiner-${kind}-${Date.now()}.${format}`);
  const progress = t => win.webContents.send('progress', t);
  try {
    if (kind === 'join') await mergeFiles(inputs, out, progress);
    else await convertFile(inputs[0], out, progress);
    tempFiles[kind] = out;
    return { ok: true, url: pathToFileURL(out).href };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('save', async (_e, kind) => {
  const tmp = tempFiles[kind];
  if (!tmp) return { ok: false, error: 'Nothing to save yet.' };
  const ext = path.extname(tmp).slice(1);
  const state = readState();
  const next = (state.n || 0) + 1;
  const dir = state.dir && fs.existsSync(state.dir) ? state.dir : app.getPath('documents');
  const r = await dialog.showSaveDialog(win, {
    title: 'Save as',
    defaultPath: path.join(dir, `${next}_${today()}.${ext}`),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled) return { canceled: true };
  try {
    fs.copyFileSync(tmp, r.filePath);
    writeState({ n: next, dir: path.dirname(r.filePath) });
    return { ok: true, path: r.filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(createWindow);
app.on('will-quit', () => { cleanTemp('join'); cleanTemp('convert'); });
app.on('window-all-closed', () => app.quit());
