import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const db = new Database(dbPath);

try {
    const remoteContent = db.prepare("SELECT count(*) as count FROM remote_content").get();
    console.log(`Remote Content: ${remoteContent.count}`);
    
    const remoteActors = db.prepare("SELECT count(*) as count FROM remote_actors").get();
    console.log(`Remote Actors: ${remoteActors.count}`);

    if (remoteContent.count > 0) {
        const samples = db.prepare("SELECT * FROM remote_content LIMIT 5").all();
        console.table(samples);
    }
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
