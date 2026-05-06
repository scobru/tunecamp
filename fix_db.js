import Database from 'better-sqlite3';
const db = new Database('tunecamp.db');

function migrate() {
    console.log("Checking schema...");
    
    // Check albums
    const tableInfoAlbums = db.pragma("table_info(albums)");
    const hasStatusAlbums = tableInfoAlbums.some(col => col.name === "status");
    if (!hasStatusAlbums) {
        console.log("Adding status to albums...");
        db.exec("ALTER TABLE albums ADD COLUMN status TEXT DEFAULT 'draft'");
    }

    // Check releases
    const tableInfoReleases = db.pragma("table_info(releases)");
    const hasStatusReleases = tableInfoReleases.some(col => col.name === "status");
    if (!hasStatusReleases) {
        console.log("Adding status to releases...");
        db.exec("ALTER TABLE releases ADD COLUMN status TEXT DEFAULT 'draft'");
    }

    // Backfill
    console.log("Backfilling statuses...");
    const res1 = db.prepare("UPDATE releases SET status = 'released' WHERE (visibility = 'public' OR visibility = 'unlisted')").run();
    const res2 = db.prepare("UPDATE albums SET status = 'released' WHERE (visibility = 'public' OR visibility = 'unlisted')").run();
    
    console.log(`Updated ${res1.changes} releases and ${res2.changes} albums to 'released'.`);
}

try {
    migrate();
} catch (e) {
    console.error("Migration failed:", e);
} finally {
    db.close();
}
