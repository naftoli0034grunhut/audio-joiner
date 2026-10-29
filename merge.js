const { spawn } = require('child_process');
const path = require('path');

// Works both in development and inside the packaged app (asar-unpacked)
const ffmpegPath = require('ffmpeg-static').replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');

const CODECS = {
  '.wav':  ['-c:a', 'pcm_s16le'],
  '.mp3':  ['-c:a', 'libmp3lame', '-q:a', '2'],
  '.flac': ['-c:a', 'flac'],
  '.m4a':  ['-c:a', 'aac', '-b:a', '192k'],
  '.ogg':  ['-c:a', 'libvorbis', '-q:a', '5'],
};

function mergeFiles(inputs, output, onProgress) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(output).toLowerCase();
    const codec = CODECS[ext];
    if (!codec) return reject(new Error('Unsupported output format: ' + ext));
    if (inputs.length < 2) return reject(new Error('Choose at least two files.'));

    // Normalize every input to the same sample rate/channels, then play them back to back.
    const norm = inputs.map((_, i) => `[${i}:a:0]aresample=44100,aformat=channel_layouts=stereo[a${i}]`).join(';');
    const cat = inputs.map((_, i) => `[a${i}]`).join('') + `concat=n=${inputs.length}:v=0:a=1[out]`;

    const args = ['-y', '-hide_banner', ...inputs.flatMap(f => ['-i', f]),
      '-filter_complex', `${norm};${cat}`, '-map', '[out]', '-vn', ...codec, output];

    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => {
      const s = d.toString();
      err += s;
      const m = s.match(/time=(\d+:\d+:\d+)/);
      if (m && onProgress) onProgress(m[1]);
    });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(output) : reject(new Error(err.split('\n').slice(-6).join('\n'))));
  });
}

module.exports = { mergeFiles };
