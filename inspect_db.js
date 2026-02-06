import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');

const allAlbums = db.prepare("SELECT * FROM albums").all();
console.log('All albums in DB:', JSON.stringify(allAlbums, null, 2));

const allTracksData = db.prepare("SELECT * FROM tracks").all();
console.log('All tracks in DB:', JSON.stringify(allTracksData, null, 2));

const allArtists = db.prepare("SELECT * FROM artists").all();
console.log('All artists in DB:', JSON.stringify(allArtists, null, 2));
