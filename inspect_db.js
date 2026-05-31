import Database from 'better-sqlite3';
import path from 'path';

console.log("CWD:", process.cwd());

const dbPaths = [
  'tunecamp.db',
  'library.db',
  'data/tunecamp.db',
  'D:\\shogun-2\\tunecamp\\tunecamp.db',
  'D:\\shogun-2\\tunecamp\\library.db',
  'D:\\shogun-2\\tunecamp\\data\\tunecamp.db'
];

for (const dbPath of dbPaths) {
  try {
    const db = new Database(dbPath);
    const countTracks = db.prepare("SELECT COUNT(*) as count FROM tracks").get().count;
    const countAlbums = db.prepare("SELECT COUNT(*) as count FROM albums").get().count;
    const countArtists = db.prepare("SELECT COUNT(*) as count FROM artists").get().count;
    console.log(`\nPath: ${dbPath}`);
    console.log(`  tracks count: ${countTracks}`);
    console.log(`  albums count: ${countAlbums}`);
    console.log(`  artists count: ${countArtists}`);
    if (countTracks > 0) {
      const tracks = db.prepare("SELECT id, title, artist_name, service, url FROM tracks LIMIT 5").all();
      console.log("  Sample Tracks:", JSON.stringify(tracks, null, 2));
    }
  } catch (e) {
    console.log(`Path: ${dbPath} failed: ${e.message}`);
  }
}
