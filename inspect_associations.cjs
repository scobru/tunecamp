const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

console.log('--- Artists ---');
const artists = db.prepare("SELECT id, name, slug FROM artists LIMIT 10").all();
console.table(artists);

console.log('--- Albums (Library) ---');
const albums = db.prepare("SELECT id, title, artist_id, is_release FROM albums LIMIT 10").all();
console.table(albums);

console.log('--- Releases (Formal) ---');
const releases = db.prepare("SELECT id, title, artist_id FROM releases LIMIT 10").all();
console.table(releases);

console.log('--- Tracks ---');
const tracks = db.prepare("SELECT id, title, artist_id, album_id FROM tracks LIMIT 10").all();
console.table(tracks);

console.log('--- Association Check (Tracks with Null Artist/Album) ---');
const orphanTracks = db.prepare("SELECT count(*) as count FROM tracks WHERE artist_id IS NULL OR album_id IS NULL").get();
console.log('Tracks with missing Artist or Album:', orphanTracks.count);

console.log('--- Association Check (Releases with Null Artist) ---');
const orphanReleases = db.prepare("SELECT count(*) as count FROM releases WHERE artist_id IS NULL").get();
console.log('Releases with missing Artist:', orphanReleases.count);

db.close();
