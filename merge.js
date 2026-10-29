const { spawn } = require('child_process');
const path = require('path');

// Works both in development and inside the packaged app (asar-unpacked)
const ffmpegPath = require('ffmpeg-static').replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');

const CODECS = {
  '.wav':  ['-c:a', 'pcm_s16le'],
  '.mp3':  ['-c:a', 'libmp3lame', '-q:a', '2', '-ar', '44100'],
  '.flac': ['-c:a', 'flac'],
  '.m4a':  ['-c:a', 'aac', '-b:a', '192k'],
  '.ogg':  ['-c:a', 'libvorbis', '-q:a', '5'],
};

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

function codecFor(output) {
  const codec = CODECS[path.extname(output).toLowerCase()];
  if (!codec) throw new Error('Unsupported output format: ' + path.extname(output));
  return codec;
}

// Join several files back to back (no gap), whatever their formats.
async function mergeFiles(inputs, output, onProgress) {
  if (inputs.length < 2) throw new Error('Choose at least two files.');
  const codec = codecFor(output);
  const norm = inputs.map((_, i) => `[${i}:a:0]aresample=44100,aformat=channel_layouts=stereo[a${i}]`).join(';');
  const cat = inputs.map((_, i) => `[a${i}]`).join('') + `concat=n=${inputs.length}:v=0:a=1[out]`;
  await run(['-y', '-hide_banner', ...inputs.flatMap(f => ['-i', f]),
    '-filter_complex', `${norm};${cat}`, '-map', '[out]', '-vn', ...codec, output], onProgress);
  return output;
}

// Convert one file to another format (keeps the original channels / sample rate where the format allows).
async function convertFile(input, output, onProgress) {
  const codec = codecFor(output);
  await run(['-y', '-hide_banner', '-i', input, '-map', '0:a:0', '-vn', ...codec, output], onProgress);
  return output;
}

module.exports = { mergeFiles, convertFile };
