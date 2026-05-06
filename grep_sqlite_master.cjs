const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const matches = db.prepare("SELECT name, sql FROM sqlite_master WHERE sql LIKE '%_old%' OR sql LIKE '%_new%'").all();
console.log(JSON.stringify(matches, null, 2));
db.close();
