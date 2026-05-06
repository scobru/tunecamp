import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='play_history'").get();
console.log(schema.sql);
db.close();
