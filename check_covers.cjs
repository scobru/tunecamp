const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = 'd:/shogun-2/tunecamp/tunecamp.db';
const outFile = 'd:/shogun-2/tunecamp/diagnostic_output.txt';

let output = `Checking DB at: ${dbPath}\n`;

try {
    const db = new Database(dbPath, { readonly: true });

    // Check settings
    try {
        const settings = db.prepare("SELECT key, value FROM settings").all();
        output += "\nSettings:\n";
        settings.forEach(s => output += `  ${s.key}: ${s.value}\n`);
    } catch (e) { output += "  No settings table or empty\n"; }

    // Check tracks to guess musicDir structure
    const tracks = db.prepare("SELECT file_path FROM tracks LIMIT 5").all();
    output += "\nSample Track Paths:\n";
    tracks.forEach(t => output += `  ${t.file_path}\n`);

    // Check albums and covers
    const albums = db.prepare("SELECT id, title, cover_path FROM albums").all();
    output += `\nFound ${albums.length} albums.\n`;

    albums.forEach(album => {
        output += `Album [${album.id}] "${album.title}": cover="${album.cover_path}"\n`;
    });

    fs.writeFileSync(outFile, output);
    console.log("Wrote output to " + outFile);

} catch (e) {
    console.error("Error:", e.message);
}
