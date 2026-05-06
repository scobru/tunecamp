import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const tracks = db.prepare("SELECT id, title, artist_name, album_id FROM tracks WHERE title LIKE '%Rhubarb%'").all();
console.log("TRACKS:");
console.table(tracks);

const album = tracks.length > 0 ? db.prepare("SELECT id, title, is_release, visibility, artist_id FROM albums WHERE id = ?").get(tracks[0].album_id) : null;
console.log("ALBUM:");
console.table(album ? [album] : []);

if (album) {
    const release = db.prepare("SELECT id, title FROM releases WHERE id = ?").get(album.id);
    console.log("RELEASE:");
    console.table(release ? [release] : []);
}
