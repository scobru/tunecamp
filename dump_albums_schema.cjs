const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='albums'").get();
console.log(row.sql);
db.close();
