import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    console.log(`--- TABLE: ${table.name} ---`);
    console.log(table.sql);
}
db.close();
