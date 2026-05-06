const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

for (const table of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all();
    for (const fk of fks) {
        if (fk.table.includes('old') || fk.table.includes('new')) {
            console.log(`🚨 Table: ${table.name} has a legacy FK:`, fk);
        }
    }
    
    const triggers = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='${table.name}'`).all();
    for (const trigger of triggers) {
        if (trigger.sql.includes('old') || trigger.sql.includes('new')) {
            console.log(`🚨 Table: ${table.name} has a legacy trigger: ${trigger.name}`);
            console.log(trigger.sql);
        }
    }
}

db.close();
