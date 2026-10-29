# Audio Joiner

Joins two or more audio files (WAV, MP3, M4A, FLAC, OGG...) into a single file, in the order shown.
Different formats can be mixed; conversion is automatic (ffmpeg is bundled).

## Run it
    npm install
    npm start

## Build the Windows installer (Setup .exe)
    npm install
    npm run build
The installer appears in `dist/` ("Audio Joiner Setup 1.0.0.exe").

## No local setup? Build in the cloud
Push this folder to a GitHub repo, open the Actions tab, run "Build Windows installer",
then download the `AudioJoiner-Installer` artifact.

Note: unsigned installers show a Windows SmartScreen warning ("More info" > "Run anyway").
