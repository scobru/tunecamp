const Database = require('better-sqlite3');
const db = new Database('D:/shogun-2/tunecamp/tunecamp.db');

function inspect_remote() {
    console.log('--- REMOTE CONTENT ---');
    try {
        const remote = db.prepare('SELECT id, title, artist_name, type FROM remote_content LIMIT 10').all();
        console.table(remote);
    } catch (e) { console.log('Error querying remote_content:', e.message); }

    console.log('\n--- SOULSEEK DOWNLOADS ---');
    try {
        const slsk = db.prepare('SELECT id, title, artist_name, status FROM soulseek_downloads LIMIT 10').all();
        console.table(slsk);
    } catch (e) { console.log('Error querying soulseek_downloads:', e.message); }

    console.log('\n--- TORRENTS ---');
    try {
        const torrents = db.prepare('SELECT id, name, status FROM torrents LIMIT 10').all();
        console.table(torrents);
    } catch (e) { console.log('Error querying torrents:', e.message); }
}

inspect_remote();
db.close();
