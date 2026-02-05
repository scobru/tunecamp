import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const notes = db.prepare('SELECT note_id, note_type, content_id, content_slug FROM ap_notes').all();
console.log(JSON.stringify(notes, null, 2));
