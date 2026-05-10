const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'd:/shogun-2/tunecamp/tunecamp.db';
const db = new Database(dbPath);

console.log('--- Albums Audit ---');
const albums = db.prepare('SELECT id, title, owner_id, visibility, status, is_release FROM albums').all();
console.log(`Total albums: ${albums.length}`);
albums.forEach(a => {
    console.log(`ID: ${a.id} | Title: ${a.title} | Owner: ${a.owner_id} | Visibility: ${a.visibility} | Status: ${a.status} | IsRelease: ${a.is_release}`);
});

console.log('\n--- Tracks Audit (sample 5) ---');
const tracks = db.prepare('SELECT id, title, album_id, owner_id FROM tracks LIMIT 5').all();
tracks.forEach(t => {
    console.log(`ID: ${t.id} | Title: ${t.title} | AlbumID: ${t.album_id} | Owner: ${t.owner_id}`);
});

console.log('\n--- Admins ---');
const admins = db.prepare('SELECT id, username, role FROM admin').all();
admins.forEach(a => {
    console.log(`ID: ${a.id} | Username: ${a.username} | Role: ${a.role}`);
});

db.close();
