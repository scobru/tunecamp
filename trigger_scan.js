import { createDatabase } from './src/server/database.js';
import { Scanner } from './src/server/scanner.js';
import { LocalDiskStorage } from './src/server/modules/storage/storage.engine.js';
import path from 'path';

const dbPath = path.resolve('tunecamp.db');
const database = createDatabase(dbPath);
const storage = new LocalDiskStorage();
const scanner = new Scanner(database, storage);

const musicDir = path.resolve('music');

console.log(`🔍 Starting manual scan of ${musicDir}...`);

async function run() {
    try {
        await scanner.scanDirectory(musicDir);
        console.log("✅ Scan complete.");
        
        const albumsCount = database.db.prepare("SELECT count(*) as count FROM albums").get().count;
        const tracksCount = database.db.prepare("SELECT count(*) as count FROM tracks").get().count;
        
        console.log(`Stats after scan:`);
        console.log(`- Albums: ${albumsCount}`);
        console.log(`- Tracks: ${tracksCount}`);
    } catch (e) {
        console.error("❌ Scan failed:", e);
    } finally {
        database.db.close();
    }
}

run();
