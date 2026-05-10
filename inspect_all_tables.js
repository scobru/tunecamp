import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new Database(dbPath);

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("TABLES:");
    console.log(tables.map(t => t.name).join(", "));

    for (const table of tables) {
        const count = db.prepare(`SELECT count(*) as count FROM ${table.name}`).get();
        if (count.count > 0) {
            console.log(`${table.name}: ${count.count} records`);
        }
    }
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
