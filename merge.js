const { spawn } = require('child_process');
const path = require('path');

// Works both in development and inside the packaged app (asar-unpacked)
const ffmpegPath = require('ffmpeg-static').replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');

const LOSSY_KBPS = { best: 192, balanced: 128, small: 96, smallest: 64 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' && v !== undefined ? Number(v) : d);

// Output encoder settings. "quality" controls the file size (smaller = lower bitrate / mono / lower sample rate).
function codecArgs(output, quality) {
  const ext = path.extname(output).toLowerCase();
  const q = LOSSY_KBPS[quality] ? quality : 'best';
  const k = LOSSY_KBPS[q] + 'k';
  const mono = q === 'smallest' ? ['-ac', '1'] : [];
  const lossless = q === 'small' ? ['-ac', '1', '-ar', '22050'] : q === 'smallest' ? ['-ac', '1', '-ar', '16000'] : [];
  switch (ext) {
    case '.mp3':  return ['-c:a', 'libmp3lame', '-b:a', k, '-ar', '44100', ...mono];
    case '.m4a':  return ['-c:a', 'aac', '-b:a', k, ...mono];
    case '.ogg':  return ['-c:a', 'libvorbis', '-b:a', k, ...mono];
    case '.wav':  return ['-c:a', 'pcm_s16le', ...lossless];
    case '.flac': return ['-c:a', 'flac', ...lossless];
    default: throw new Error('Unsupported output format: ' + ext);
  }
}

// Per-file sound adjustments: volume (%), bass (dB), treble (dB).
function effectFilters(e = {}) {
  const vol = clamp(num(e.vol, 100) / 100, 0.05, 4);
  const bass = clamp(num(e.bass, 0), -20, 20);
  const treble = clamp(num(e.treble, 0), -20, 20);
  const f = [];
  if (bass) f.push(`bass=g=${bass}:f=200:t=q:w=0.707`);
  if (treble) f.push(`treble=g=${treble}:f=3000:t=q:w=0.707`);
  if (vol !== 1) f.push(`volume=${vol}`);
  // soft limiter so boosting never causes harsh clipping (level=disabled keeps the volume you chose)
  if (vol > 1 || bass > 0 || treble > 0) f.push('alimiter=limit=0.97:level=disabled');
  return f;
}

function run(args, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => {
      const s = d.toString();
      err += s;
      const m = s.match(/time=(\d+:\d+:\d+)/);
      if (m && onProgress) onProgress(m[1]);
    });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err.split('\n').slice(-6).join('\n'))));
  });
}

// inputs: array of { path, vol, bass, treble }  (plain path strings also accepted)
async function mergeFiles(inputs, output, onProgress, opts = {}) {
  if (inputs.length < 2) throw new Error('Choose at least two files.');
  const items = inputs.map(i => (typeof i === 'string' ? { path: i } : i));
  const codec = codecArgs(output, opts.quality);
  const norm = items.map((it, i) => {
    const chain = ['aresample=44100', 'aformat=sample_fmts=fltp:channel_layouts=stereo', ...effectFilters(it)];
    return `[${i}:a:0]${chain.join(',')}[a${i}]`;
  }).join(';');
  const cat = items.map((_, i) => `[a${i}]`).join('') + `concat=n=${items.length}:v=0:a=1[out]`;
  await run(['-y', '-hide_banner', ...items.flatMap(it => ['-i', it.path]),
    '-filter_complex', `${norm};${cat}`, '-map', '[out]', '-vn', ...codec, output], onProgress);
  return output;
}

// Convert one file (keeps channels / sample rate unless a smaller size is requested).
async function convertFile(input, output, onProgress, opts = {}) {
  const it = typeof input === 'string' ? { path: input } : input;
  const codec = codecArgs(output, opts.quality);
  const fx = effectFilters(it);
  const af = fx.length ? ['-af', ['aformat=sample_fmts=fltp', ...fx].join(',')] : [];
  await run(['-y', '-hide_banner', '-i', it.path, '-map', '0:a:0', '-vn', ...af, ...codec, output], onProgress);
  return output;
}

module.exports = { mergeFiles, convertFile };
