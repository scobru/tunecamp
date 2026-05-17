import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const all = db.prepare("SELECT type, name, sql FROM sqlite_master").all();
console.log("All objects:");
console.log(JSON.stringify(all, null, 2));

try {
    const vTracks = db.prepare("PRAGMA table_info(v_tracks)").all();
    console.log("v_tracks info:", vTracks);
} catch (e) {
    console.log("v_tracks pragma failed:", e.message);
}
