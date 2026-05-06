import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const users = db.prepare('SELECT username FROM admin').all();
console.log(JSON.stringify(users, null, 2));
db.close();
