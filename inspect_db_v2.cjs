const Database = require('better-sqlite3');
const db = new Database('D:/shogun-2/tunecamp/tunecamp.db');

function inspect() {
    console.log('--- TRACKS COLUMNS ---');
    console.log(db.prepare("PRAGMA table_info(tracks)").all().map(c => c.name).join(', '));

    console.log('\n--- RECENT TRACKS ---');
    const tracks = db.prepare('SELECT id, title, album_id, artist_id FROM tracks ORDER BY id DESC LIMIT 10').all();
    console.table(tracks);

    console.log('\n--- ALBUMS COLUMNS ---');
    console.log(db.prepare("PRAGMA table_info(albums)").all().map(c => c.name).join(', '));

    console.log('\n--- RECENT ALBUMS ---');
    const albums = db.prepare('SELECT id, title, artist_id, is_release, visibility, status FROM albums ORDER BY id DESC LIMIT 10').all();
    console.table(albums);

    console.log('\n--- RELEASE LIMBO CHECK ---');
    // Check if albums have is_release = 1 but are missing from releases table
    const limbo = db.prepare('SELECT id, title FROM albums WHERE is_release = 1 AND id NOT IN (SELECT id FROM releases)').all();
    console.table(limbo);

    console.log('\n--- RECENT RELEASES ---');
    try {
        const releases = db.prepare('SELECT id, title, artist_id, visibility, status FROM releases ORDER BY id DESC LIMIT 10').all();
        console.table(releases);
    } catch (e) {
        console.log('Releases table might not exist or has different columns:', e.message);
    }
}

inspect();
db.close();
