import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new Database(dbPath);

try {
    const albums = db.prepare("SELECT id, title, is_release, visibility FROM albums").all();
    console.log("ALBUMS:");
    console.table(albums);

    const releases = db.prepare("SELECT id, title, visibility FROM releases").all();
    console.log("\nRELEASES:");
    console.table(releases);

    const tracks = db.prepare("SELECT id, title, album_id, artist_id FROM tracks LIMIT 10").all();
    console.log("\nTRACKS (First 10):");
    console.table(tracks);
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
