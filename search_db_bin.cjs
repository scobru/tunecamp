const fs = require('fs');
const buffer = fs.readFileSync('tunecamp.db');
const search = Buffer.from('tracks_old');
let pos = 0;
while (true) {
    const found = buffer.indexOf(search, pos);
    if (found === -1) break;
    console.log(`Found 'tracks_old' at offset ${found}`);
    // Show surrounding 50 bytes
    const start = Math.max(0, found - 50);
    const end = Math.min(buffer.length, found + 50);
    console.log(buffer.slice(start, end).toString('ascii').replace(/[^\x20-\x7E]/g, '.'));
    pos = found + 1;
}
