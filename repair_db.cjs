const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

console.log("Starting Database Repair...");

try {
    // 1. Create a dummy tracks_old to prevent "no such table" errors while searching
    db.exec("CREATE TABLE IF NOT EXISTS tracks_old (id INTEGER PRIMARY KEY)");
    console.log("Created temporary tracks_old table.");

    // 2. Find triggers referencing tracks_old
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%tracks_old%'").all();
    
    if (triggers.length > 0) {
        console.log(`Found ${triggers.length} broken triggers referencing tracks_old:`);
        for (const trigger of triggers) {
            console.log(` - Dropping broken trigger: ${trigger.name}`);
            db.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`);
        }
    } else {
        console.log("No broken triggers found in sqlite_master.");
    }

    // 3. Check for foreign keys
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const table of tables) {
        const fks = db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all();
        const broken = fks.filter(fk => fk.table === 'tracks_old');
        if (broken.length > 0) {
            console.log(`Table ${table.name} has foreign keys pointing to tracks_old. This table might need recreation.`);
            // SQLite doesn't allow dropping FKs easily. We might need to recreate the table.
        }
    }

    // 4. Drop the dummy table
    db.exec("DROP TABLE tracks_old");
    console.log("Dropped temporary tracks_old table.");
    
    // 5. Vacuum to clean up
    db.exec("VACUUM");
    console.log("Database vacuumed.");

    console.log("Repair complete!");
} catch (e) {
    console.error("Repair failed:", e);
} finally {
    db.close();
}
