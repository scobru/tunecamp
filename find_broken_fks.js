import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all();
    for (const fk of fks) {
        if (fk.table === 'tracks_old') {
            console.log(`🚨 Table "${table.name}" has an FK pointing to "tracks_old"!`);
            console.log(JSON.stringify(fk, null, 2));
        }
    }
}
db.close();
