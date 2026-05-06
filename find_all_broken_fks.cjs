const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all();
    const broken = fks.filter(fk => fk.table.includes('_old') || fk.table.includes('_new'));
    if (broken.length > 0) {
        console.log(`Broken FKs in ${table.name}:`, JSON.stringify(broken, null, 2));
    }
}
db.close();
