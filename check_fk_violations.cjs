const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const result = db.prepare("PRAGMA foreign_key_check").all();
console.log(JSON.stringify(result, null, 2));
db.close();
