const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const views = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='view'").all();
console.log(JSON.stringify(views, null, 2));
db.close();
