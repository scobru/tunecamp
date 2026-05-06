const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const tables = ['bookmarks', 'starred_items', 'item_ratings'];
for (const table of tables) {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE name='${table}'`).get();
    console.log(`Table: ${table}`);
    console.log(row ? row.sql : 'NOT FOUND');
}

db.close();
