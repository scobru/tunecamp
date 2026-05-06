const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const rows = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE sql LIKE '%tracks_old%'").all();
console.log('Matches in sqlite_master:', JSON.stringify(rows, null, 2));

const tempRows = db.prepare("SELECT name, type, sql FROM sqlite_temp_master WHERE sql LIKE '%tracks_old%'").all();
console.log('Matches in sqlite_temp_master:', JSON.stringify(tempRows, null, 2));

db.close();
