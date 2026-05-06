const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
db.pragma('wal_checkpoint(TRUNCATE)');
console.log("Checkpoint completed.");
db.close();
