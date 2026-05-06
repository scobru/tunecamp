const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE sql LIKE '%CHECK%'").all();
console.log(JSON.stringify(tables, null, 2));
db.close();
