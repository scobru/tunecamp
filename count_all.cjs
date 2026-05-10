const Database = require('better-sqlite3');
const db = new Database('D:/shogun-2/tunecamp/tunecamp.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

for (const table of tables) {
    const count = db.prepare(`SELECT count(*) as count FROM ${table.name}`).get().count;
    console.log(`${table.name}: ${count} rows`);
}

db.close();
