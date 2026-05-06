import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const releases = db.prepare('SELECT id, title, visibility, status FROM releases').all();
console.log(JSON.stringify(releases, null, 2));
db.close();
