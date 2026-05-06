const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const fks = db.prepare("PRAGMA foreign_key_list(releases)").all();
console.log(JSON.stringify(fks, null, 2));
db.close();
