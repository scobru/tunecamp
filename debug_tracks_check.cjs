
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(process.cwd(), "tunecamp.db");
console.log(`Checking DB at ${dbPath}`);

try {
    const db = new Database(dbPath, { readonly: true });

    // 1. Get all tracks count
    const allTracks = db.prepare("SELECT count(*) as count FROM tracks").get();
    console.log(`Total tracks in DB: ${allTracks.count}`);

    // 2. Simulate tracks.ts logic
    // const allTracksData = database.getTracks();
    // This joins with albums and artists but NOT for the full album object.

    // tracks.ts logic:
    // const publicTracks = allTracks.filter(track => {
    //     if (!track.album_id) return false;
    //     const album = database.getAlbum(track.album_id);
    //     return album && (album.is_public || album.visibility === 'public');
    // });

    // Let's pull all tracks with their album_id
    const tracks = db.prepare("SELECT id, album_id FROM tracks").all();

    let visibleCount = 0;
    let albumCache = {};

    for (const track of tracks) {
        if (!track.album_id) continue;

        let album = albumCache[track.album_id];
        if (!album) {
            album = db.prepare("SELECT is_public, visibility FROM albums WHERE id = ?").get(track.album_id);
            if (album) albumCache[track.album_id] = album;
        }

        if (album) {
            // JS truthiness check: album.is_public (integer) || album.visibility === 'public'
            // In JS: 1 || false -> 1 (truthy)
            // 0 || false -> 0 (falsy) - unless visibility is 'public'
            const isVisible = (album.is_public || album.visibility === 'public');
            if (isVisible) {
                visibleCount++;
            }
        }
    }

    console.log(`Visible tracks (simulated logic): ${visibleCount}`);

    // 3. Inspect Albums visibility distribution
    const albums = db.prepare("SELECT id, title, is_public, visibility FROM albums").all();
    console.log("\nAlbum Visibility Summary:");
    console.log("ID | Title | is_public | visibility");
    console.log("---|---|---|---");
    albums.forEach(a => {
        console.log(`${a.id} | ${a.title} | ${a.is_public} | ${a.visibility}`);
    });

} catch (err) {
    console.error("Error accessing DB:", err);
}
