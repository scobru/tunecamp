const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const triggers = db.prepare("SELECT name, type, tbl_name, sql FROM sqlite_master WHERE type='trigger'").all();
console.log(JSON.stringify(triggers, null, 2));
db.close();
