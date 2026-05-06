import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tracks'").get();
console.log(schema.sql);
db.close();
