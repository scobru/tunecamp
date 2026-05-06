const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

for (const table of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list('${table.name}')`).all();
    for (const fk of fks) {
        if (fk.table === 'tracks_old' || fk.table === 'tracks') {
            console.log(`Table [${table.name}] has FK to [${fk.table}] on column [${fk.from}]`);
        }
    }
}
db.close();
