const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all();
    if (fks.length > 0) {
        console.log(`--- FKs for ${table.name} ---`);
        console.log(JSON.stringify(fks, null, 2));
    }
}
db.close();
