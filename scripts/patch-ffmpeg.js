import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.resolve(__dirname, '../node_modules/@ffmpeg-installer/ffmpeg/index.js');

try {
    if (fs.existsSync(targetFile)) {
        const patchContent = `'use strict';

const fs = require('fs');

// Detect operating system to provide sensible fallback paths
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// Search order for ffmpeg:
// 1. FFMPEG_PATH environment variable
// 2. System ffmpeg on PATH (which resolves to 'ffmpeg')
// 3. Common system installations
let ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

if (process.env.FFMPEG_PATH) {
    ffmpegPath = process.env.FFMPEG_PATH;
} else if (isWin) {
    // Windows fallback locations
    if (fs.existsSync('C:\\\\ffmpeg\\\\bin\\\\ffmpeg.exe')) {
        ffmpegPath = 'C:\\\\ffmpeg\\\\bin\\\\ffmpeg.exe';
    } else if (fs.existsSync('C:\\\\Program Files\\\\ffmpeg\\\\bin\\\\ffmpeg.exe')) {
        ffmpegPath = 'C:\\\\Program Files\\\\ffmpeg\\\\bin\\\\ffmpeg.exe';
    }
} else if (isMac) {
    // macOS fallback locations
    if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
        ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    } else if (fs.existsSync('/usr/local/bin/ffmpeg')) {
        ffmpegPath = '/usr/local/bin/ffmpeg';
    }
} else {
    // Linux/Alpine fallback locations
    if (fs.existsSync('/usr/bin/ffmpeg')) {
        ffmpegPath = '/usr/bin/ffmpeg';
    } else if (fs.existsSync('/usr/local/bin/ffmpeg')) {
        ffmpegPath = '/usr/local/bin/ffmpeg';
    }
}

module.exports = {
    path: ffmpegPath,
    version: '4.1.0',
    url: 'https://ffmpeg.org/'
};
`;
        fs.writeFileSync(targetFile, patchContent, 'utf8');
        console.log('✅ Successfully patched @ffmpeg-installer/ffmpeg to use system or fallback ffmpeg.');
    } else {
        console.warn('⚠️ @ffmpeg-installer/ffmpeg not found in node_modules, skipping patch.');
    }
} catch (error) {
    console.error('❌ Failed to patch @ffmpeg-installer/ffmpeg:', error);
}
