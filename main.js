const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { mergeFiles, convertFile } = require('./merge');

let win;
const tempFiles = { join: null, convert: null };
const recTemps = new Set();

function createWindow() {
  win = new BrowserWindow({
    width: 920, height: 680, minWidth: 780, minHeight: 560,
    title: 'Audio Join', autoHideMenuBar: true, backgroundColor: '#f5f5f5',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  // allow the microphone (and nothing else)
  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');
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

// A finished microphone recording arrives as raw bytes; turn it into a WAV so it plays and seeks properly.
ipcMain.handle('save-recording', async (_e, data) => {
  const base = path.join(os.tmpdir(), `audio-joiner-rec-${Date.now()}`);
  const raw = base + '.webm', wav = base + '.wav';
  try {
    fs.writeFileSync(raw, Buffer.from(data));
    await convertFile(raw, wav);
    recTemps.add(wav);
    return { ok: true, path: wav, url: pathToFileURL(wav).href };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.unlinkSync(raw); } catch (_) {}
  }
});

// Read an audio file so the app can play it (and apply live volume/bass/treble) from memory.
const AUDIO_OK = /\.(wav|mp3|m4a|aac|flac|ogg|wma|opus|aiff?)$/i;
ipcMain.handle('read-file', async (_e, p) => {
  if (typeof p !== 'string' || !AUDIO_OK.test(p)) throw new Error('Not an audio file');
  return fs.promises.readFile(p);
});

ipcMain.handle('delete-temp', (_e, p) => {
  if (recTemps.has(p)) { try { fs.unlinkSync(p); } catch (_) {} recTemps.delete(p); }
});

// Create the result in a temp file so it can be previewed before saving.
ipcMain.handle('process', async (_e, { kind, inputs, format, quality }) => {
  cleanTemp(kind);
  const out = path.join(os.tmpdir(), `audio-joiner-${kind}-${Date.now()}.${format}`);
  const progress = t => win.webContents.send('progress', t);
  try {
    if (kind === 'join') await mergeFiles(inputs, out, progress, { quality });
    else await convertFile(inputs[0], out, progress, { quality });
    tempFiles[kind] = out;
    const size = fs.statSync(out).size;
    return { ok: true, url: pathToFileURL(out).href, size };
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
    writeState({ ...readState(), n: next, dir: path.dirname(r.filePath) });
    return { ok: true, path: r.filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});


// ---------- batch convert: many files -> one destination ----------
const sanitizeName = s => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim();
function uniquePath(dir, base, ext) {
  let out = path.join(dir, `${base}.${ext}`), i = 2;
  while (fs.existsSync(out)) { out = path.join(dir, `${base} (${i}).${ext}`); i++; }   // never overwrite anything
  return out;
}

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose where to save the files', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('get-default-dir', () => {
  const s = readState();
  return s.convertDir && fs.existsSync(s.convertDir) ? s.convertDir : app.getPath('documents');
});
ipcMain.handle('open-folder', (_e, p) => shell.openPath(p));

ipcMain.handle('convert-batch', async (_e, { items, format, quality, destDir, newFolder, newNames }) => {
  const ext = String(format).replace(/[^a-z0-9]/gi, '');
  let dir = destDir;
  try {
    if (!dir || !fs.existsSync(dir)) throw new Error('The destination folder does not exist.');
    const folder = newFolder ? sanitizeName(newFolder) : '';
    if (folder) { dir = path.join(dir, folder); fs.mkdirSync(dir, { recursive: true }); }
  } catch (e) { return { ok: false, error: e.message }; }

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    win.webContents.send('batch-progress', { index: i + 1, total: items.length, name: it.name });
    // keep the old name by default; recordings have no real name, so they always get number + date
    const numbered = !!newNames || !!it.recorded;
    let n = readState().n || 0, base;
    if (numbered) { n += 1; base = `${n}_${today()}`; }
    else base = sanitizeName(path.basename(it.name, path.extname(it.name))) || `file_${i + 1}`;
    const out = uniquePath(dir, base, ext);
    try {
      await convertFile(it, out, null, { quality });
      if (numbered) writeState({ ...readState(), n });
      results.push({ ok: true, name: path.basename(out), size: fs.statSync(out).size });
    } catch (e) { results.push({ ok: false, name: it.name, error: e.message }); }
  }
  writeState({ ...readState(), convertDir: destDir });
  return { ok: true, dir, results };
});

ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(createWindow);
app.on('will-quit', () => {
  cleanTemp('join'); cleanTemp('convert');
  recTemps.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });
});
app.on('window-all-closed', () => app.quit());
