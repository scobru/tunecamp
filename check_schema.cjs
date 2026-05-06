const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const tables = ['tracks', 'track_ownership', 'release_tracks', 'play_history', 'bookmarks', 'starred_items', 'item_ratings'];
for (const table of tables) {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table);
    console.log(`--- ${table} ---`);
    console.log(row ? row.sql : 'NOT FOUND');
}
db.close();
