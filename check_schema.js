import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const info = db.prepare("PRAGMA table_info(releases)").all();
console.log(JSON.stringify(info, null, 2));
db.close();
