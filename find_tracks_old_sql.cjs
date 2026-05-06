const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const rows = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE sql LIKE '%tracks_old%' AND name != 'tracks_old'").all();
console.log('Other objects referencing tracks_old:', JSON.stringify(rows, null, 2));

db.close();
