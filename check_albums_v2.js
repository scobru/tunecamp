import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');
const albums = db.prepare("SELECT id, title, visibility, status, is_release FROM albums WHERE title LIKE '%Party%'").all();
console.log(JSON.stringify(albums, null, 2));
db.close();
