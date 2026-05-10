const db = require('better-sqlite3')('D:/shogun-2/tunecamp/tunecamp.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

const stats = {};
tables.forEach(t => {
    try {
        const count = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get().c;
        stats[t.name] = count;
    } catch (e) {
        stats[t.name] = 'error';
    }
});
console.log('Row counts:', JSON.stringify(stats, null, 2));
db.close();
