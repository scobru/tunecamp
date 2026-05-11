const Database = require('better-sqlite3');
const db = new Database('tunecamp.db');

console.log('--- Database Audit ---');

// 1. Check for public drafts
const publicDrafts = db.prepare("SELECT count(*) as count FROM albums WHERE visibility = 'public' AND status = 'draft'").get();
console.log(`Public Library Albums in 'draft' status: ${publicDrafts.count}`);

const publicReleaseDrafts = db.prepare("SELECT count(*) as count FROM releases WHERE visibility = 'public' AND status = 'draft'").get();
console.log(`Public Releases in 'draft' status: ${publicReleaseDrafts.count}`);

// 2. Check for orphan release_tracks
const orphans = db.prepare(`
    SELECT count(*) as count FROM release_tracks rt
    WHERE NOT EXISTS (SELECT 1 FROM releases r WHERE r.id = rt.release_id)
    OR (rt.track_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tracks t WHERE t.id = rt.track_id))
`).get();
console.log(`Orphaned release_tracks: ${orphans.count}`);

// 3. Performance test for public tracks query
const start = Date.now();
const rows = db.prepare(`
    SELECT t.*, a.title as album_title, a.album_artist, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
    ar_t.id as artist_id,
    COALESCE(ar_t.name, t.artist_name, a.album_artist, ar_a.name, 'Unknown Artist') as artist_name, 
    COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
    COALESCE(t.owner_id, a.owner_id) as owner_id
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
    LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
    WHERE (a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released')
       OR EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.visibility IN ('public', 'unlisted') AND r.status = 'released')
    LIMIT 100
`).all();
const end = Date.now();
console.log(`Public tracks query took ${end - start}ms for ${rows.length} rows`);

db.close();
