const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    if (table.sql && table.sql.includes('_old')) {
        console.log(`Table ${table.name} SQL contains _old:`, table.sql);
    }
}
db.close();
