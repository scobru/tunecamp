
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(process.cwd(), "tunecamp.db");
const db = new Database(dbPath);

console.log(`Checking database at ${dbPath}`);

function addColumn(table, column, definition) {
    try {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all();
        const hasColumn = columns.some(c => c.name === column);

        if (!hasColumn) {
            console.log(`Adding missing column '${column}' to table '${table}'...`);
            db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
            console.log(`✅ Added '${column}' to '${table}'.`);
            return true;
        } else {
            console.log(`ℹ️  Column '${column}' already exists in '${table}'.`);
            return false;
        }
    } catch (err) {
        console.error(`❌ Error adding column '${column}' to '${table}':`, err.message);
        return false;
    }
}

// 1. Fix albums table
if (addColumn("albums", "visibility", "TEXT DEFAULT 'private'")) {
    console.log("Backfilling visibility data...");
    // Backfill logic from database.ts
    db.prepare("UPDATE albums SET visibility = 'public' WHERE is_public = 1").run();
    db.prepare("UPDATE albums SET visibility = 'private' WHERE is_public = 0").run();
    console.log("✅ Backfilled 'visibility' based on 'is_public'.");
}

// 2. Fix posts table (just in case)
addColumn("posts", "visibility", "TEXT DEFAULT 'public'");

console.log("\nDatabase schema check complete.");
