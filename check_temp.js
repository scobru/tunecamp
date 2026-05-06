import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
try {
    const rows = db.prepare("SELECT name, sql FROM sqlite_temp_master WHERE sql LIKE '%tracks_old%'").all();
    console.log('TEMP MASTER MATCHES:', JSON.stringify(rows, null, 2));
} catch(e) {
    console.log('sqlite_temp_master error:', e.message);
}
db.close();
