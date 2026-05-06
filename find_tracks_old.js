import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const rows = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE LOWER(sql) LIKE '%tracks_old%'").all();
console.log('SQLITE_MASTER MATCHES:', JSON.stringify(rows, null, 2));
const tempRows = db.prepare("SELECT name, type, sql FROM sqlite_temp_master WHERE LOWER(sql) LIKE '%tracks_old%'").all();
console.log('SQLITE_TEMP_MASTER MATCHES:', JSON.stringify(tempRows, null, 2));
db.close();
