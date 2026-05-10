import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');

const settings = db.prepare("SELECT * FROM settings").all();
settings.forEach(s => console.log(`${s.key}: ${s.value}`));
