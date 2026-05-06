const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const master = db.prepare("SELECT * FROM sqlite_master").all();
console.log("--- FULL SQLITE_MASTER ---");
console.log(JSON.stringify(master, null, 2));

const tempMaster = db.prepare("SELECT * FROM sqlite_temp_master").all();
console.log("--- FULL SQLITE_TEMP_MASTER ---");
console.log(JSON.stringify(tempMaster, null, 2));

db.close();
