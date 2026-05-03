import sqlite3 from 'better-sqlite3';
const db = new sqlite3('tunecamp.db');

console.log("Tables:");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(JSON.stringify(tables, null, 2));

for (const table of tables as { name: string }[]) {
    console.log(`\nSchema for ${table.name}:`);
    const schema = db.prepare(`PRAGMA table_info(${table.name})`).all();
    console.log(JSON.stringify(schema, null, 2));
    
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
    console.log(`Count: ${count.count}`);
}

db.close();
