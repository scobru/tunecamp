import Database from 'better-sqlite3';

const db = new Database('tunecamp.db');

try {
    console.log("Starting manual migration...");

    // Check columns
    const columns = db.prepare("PRAGMA table_info(admin)").all();
    const hasUsername = columns.some(c => c.name === 'username');

    if (hasUsername) {
        console.log("Migration not needed: 'username' column exists.");
        process.exit(0);
    }

    console.log("Migrating admin table...");

    // 1. Rename existing table
    db.exec("ALTER TABLE admin RENAME TO admin_old");

    // 2. Create new table
    db.exec(`
        CREATE TABLE admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            artist_id INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 3. Migrate data
    const oldAdmins = db.prepare("SELECT * FROM admin_old").all();
    const insertStmt = db.prepare("INSERT INTO admin (id, username, password_hash, created_at, updated_at, artist_id) VALUES (?, ?, ?, ?, ?, ?)");

    for (const old of oldAdmins) {
        // Default to 'admin' for id 1 (root), or 'adminUSER_ID' for others if any
        let username = 'admin';
        if (old.id !== 1) {
            username = 'admin_' + old.id;
        }

        console.log(`Migrating user ID ${old.id} as '${username}'`);

        // Handle potentially missing columns in old table
        const createdAt = old.created_at || new Date().toISOString();
        const updatedAt = old.updated_at || new Date().toISOString();

        insertStmt.run(old.id, username, old.password_hash, createdAt, updatedAt, null);
    }

    // 4. Drop old table
    db.exec("DROP TABLE admin_old");

    console.log("Migration complete!");

    // Verify
    const newAdmins = db.prepare("SELECT * FROM admin").all();
    console.log("New Admins:", newAdmins);

} catch (e) {
    console.error("Migration failed:", e);
}
