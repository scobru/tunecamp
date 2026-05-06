const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

console.log("Testing merge statements individually...");

const fromId = 252;
const toId = 449;
const targetFilePath = 'imports/telegram/Brian Eno - Und';

const statements = [
    { name: "track_ownership update", sql: "INSERT OR IGNORE INTO track_ownership (track_id, owner_id) SELECT ?, owner_id FROM track_ownership WHERE track_id = ?", params: [toId, fromId] },
    { name: "release_tracks update", sql: "UPDATE release_tracks SET track_id = ?, file_path = ? WHERE track_id = ?", params: [toId, targetFilePath, fromId] },
    { name: "play_history update", sql: "UPDATE play_history SET track_id = ? WHERE track_id = ?", params: [toId, fromId] },
    { name: "bookmarks update", sql: "UPDATE bookmarks SET track_id = ? WHERE track_id = ?", params: [toId, String(fromId)] },
    { name: "starred_items update", sql: "UPDATE starred_items SET item_id = ? WHERE item_id = ? AND item_type = 'track'", params: [String(toId), String(fromId)] },
    { name: "item_ratings update", sql: "UPDATE item_ratings SET item_id = ? WHERE item_id = ? AND item_type = 'track'", params: [String(toId), String(fromId)] },
    { name: "track_ownership delete", sql: "DELETE FROM track_ownership WHERE track_id = ?", params: [fromId] },
    { name: "tracks delete", sql: "DELETE FROM tracks WHERE id = ?", params: [fromId] }
];

db.exec("BEGIN TRANSACTION");
try {
    for (const stmt of statements) {
        console.log(`Running: ${stmt.name}`);
        try {
            db.prepare(stmt.sql).run(...stmt.params);
            console.log(`  SUCCESS: ${stmt.name}`);
        } catch (e) {
            console.error(`  FAILED: ${stmt.name} - ${e.message}`);
        }
    }
} finally {
    db.exec("ROLLBACK");
    db.close();
}
