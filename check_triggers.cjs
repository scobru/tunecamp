const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const triggers = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'").all();

for (const trigger of triggers) {
    console.log(`Trigger: ${trigger.name} on table ${trigger.tbl_name}`);
    console.log(trigger.sql);
    if (trigger.sql.includes('tracks_old')) {
        console.log(`🚨 FOUND tracks_old in trigger ${trigger.name}!`);
    }
}

db.close();
