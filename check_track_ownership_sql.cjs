const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='track_ownership'").get();
console.log(sql.sql);
db.close();
