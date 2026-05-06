const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const indices = db.prepare("PRAGMA index_list(tracks)").all();
for (const idx of indices) {
    const info = db.prepare(`PRAGMA index_info("${idx.name}")`).all();
    console.log(`Index: ${idx.name}`, JSON.stringify(info, null, 2));
}
db.close();
