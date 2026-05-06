import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const fkList = db.prepare("PRAGMA foreign_key_list(play_history)").all();
console.log(JSON.stringify(fkList, null, 2));
db.close();
