
import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');

const admins = db.prepare('SELECT id, username, artist_id FROM admin').all();
console.log('Admins:', admins);
