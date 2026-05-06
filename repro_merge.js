import Database from 'better-sqlite3';
import { TrackRepository } from './dist/server/repositories/track.repository.js';

const db = new Database('tunecamp.db');
const trackRepo = new TrackRepository(db);

// We need two valid track IDs to test merge
const tracks = db.prepare("SELECT id, file_path FROM tracks LIMIT 2").all();
if (tracks.length < 2) {
    console.log("Not enough tracks to test merge");
    process.exit(0);
}

const [fromTrack, toTrack] = tracks;
console.log(`Merging track ${fromTrack.id} into ${toTrack.id}...`);

try {
    trackRepo.merge(fromTrack.id, toTrack.id, toTrack.file_path);
    console.log("Merge successful!");
} catch (err) {
    console.error("Merge failed with error:", err.message);
    if (err.stack) console.error(err.stack);
}

db.close();
