const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const views = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='view'").all();

for (const view of views) {
    console.log(`View: ${view.name}`);
    console.log(view.sql);
    if (view.sql.includes('tracks_old')) {
        console.log(`🚨 FOUND tracks_old in view ${view.name}!`);
    }
}

db.close();
