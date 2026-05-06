const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');
const list = db.prepare("PRAGMA database_list").all();
console.log(JSON.stringify(list, null, 2));
db.close();
