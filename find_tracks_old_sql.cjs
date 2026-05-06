const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const matches = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE sql LIKE '%tracks_old%'").all();
console.log(JSON.stringify(matches, null, 2));
db.close();
