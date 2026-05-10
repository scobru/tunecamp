const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'D:/shogun-2/tunecamp/tunecamp.db';
const db = new Database(dbPath);

console.log('🛠️ Starting Album Association Repair...');

try {
    // 1. Find tracks that are in a release but currently point to a different album_id
    // Usually, a release is an album with is_release = 1
    const tracksToRepair = db.prepare(`
        SELECT rt.track_id, rt.release_id, t.title, t.album_id as current_album_id, a.title as current_album_title
        FROM release_tracks rt
        JOIN tracks t ON rt.track_id = t.id
        LEFT JOIN albums a ON t.album_id = a.id
        WHERE t.album_id != rt.release_id OR t.album_id IS NULL
    `).all();

    console.log(`🔍 Found ${tracksToRepair.length} tracks with mismatched associations.`);

    let repaired = 0;
    const updateStmt = db.prepare('UPDATE tracks SET album_id = ? WHERE id = ?');

    db.transaction(() => {
        for (const t of tracksToRepair) {
            console.log(`🩹 Repairing track: "${t.title}" (ID: ${t.track_id})`);
            console.log(`   - Current Album: ${t.current_album_title || 'None'} (ID: ${t.current_album_id})`);
            console.log(`   - Restoring to Release ID: ${t.release_id}`);
            updateStmt.run(t.release_id, t.track_id);
            repaired++;
        }
    })();

    console.log(`\n✅ Repair complete! Restored ${repaired} associations.`);

    // 2. Clean up empty "Library" albums that were created by the scanner
    const emptyAlbums = db.prepare(`
        SELECT id, title FROM albums 
        WHERE is_release = 0 
        AND id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL)
    `).all();

    if (emptyAlbums.length > 0) {
        console.log(`\n🧹 Cleaning up ${emptyAlbums.length} empty library albums...`);
        const deleteStmt = db.prepare('DELETE FROM albums WHERE id = ?');
        db.transaction(() => {
            for (const a of emptyAlbums) {
                console.log(`   - Removing empty album: "${a.title}" (ID: ${a.id})`);
                deleteStmt.run(a.id);
            }
        })();
    }

} catch (e) {
    console.error('❌ Error during repair:', e);
} finally {
    db.close();
}
