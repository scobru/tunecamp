import { createDatabase } from "./database.js";
import fs from "fs-extra";
import path from "path";

async function runRepro() {
    const dbPath = "./repro_concurrency.db";
    if (await fs.pathExists(dbPath)) {
        await fs.remove(dbPath);
    }

    console.log("🚀 Starting Concurrency Stress Test...");
    const dbService = createDatabase(dbPath);

    // 1. Initial Data Setup
    console.log("📦 Setting up initial data...");
    for (let i = 1; i <= 10; i++) {
        dbService.createArtist(`Artist ${i}`, `artist-${i}`);
    }

    const artists = dbService.getArtists();
    const artistId = artists[0].id;

    console.log("⚡ Starting concurrent operations...");

    let busyErrors = 0;
    let successfulReads = 0;
    let successfulWrites = 0;

    const readLoop = async () => {
        for (let i = 0; i < 500; i++) {
            try {
                dbService.getArtists();
                successfulReads++;
            } catch (err: any) {
                if (err.message?.includes("database is busy")) {
                    busyErrors++;
                } else {
                    console.error("Read Error:", err.message);
                }
            }
            // Small jitter
            await new Promise(r => setTimeout(r, Math.random() * 5));
        }
    };

    const writeLoop = async () => {
        for (let i = 0; i < 500; i++) {
            try {
                dbService.createAlbum({ 
                    title: `Stress Album ${i}`, 
                    slug: `album-${Date.now()}-${i}-${Math.random()}`,
                    artist_id: artistId,
                    status: 'released',
                    visibility: 'public',
                    description: 'Stress test album',
                    cover_path: '',
                    release_date: new Date().toISOString(),
                    is_release: false
                });
                successfulWrites++;
            } catch (err: any) {
                if (err.message?.includes("database is busy")) {
                    busyErrors++;
                } else {
                    console.error("Write Error:", err.message);
                }
            }
        }
    };

    // Run multiple loops in parallel
    const start = Date.now();
    await Promise.all([
        readLoop(),
        readLoop(),
        readLoop(),
        readLoop(),
        readLoop(),
        writeLoop(),
        writeLoop(),
        writeLoop(),
        writeLoop()
    ]);
    const duration = Date.now() - start;

    console.log("\n--- Results ---");
    console.log(`Duration: ${duration}ms`);
    console.log(`Successful Reads: ${successfulReads}`);
    console.log(`Successful Writes: ${successfulWrites}`);
    console.log(`Busy Errors: ${busyErrors}`);

    if (busyErrors > 0) {
        console.log("\n❌ VULNERABILITY CONFIRMED: Database busy errors detected under load.");
    } else {
        console.log("\n✅ NO ISSUES DETECTED: SQLite handled the concurrency fine.");
    }

    // Close DB connection properly
    dbService.db.close();
    
    await fs.remove(dbPath);
    await fs.remove(`${dbPath}-shm`);
    await fs.remove(`${dbPath}-wal`);
    process.exit(busyErrors > 0 ? 1 : 0);
}

runRepro().catch(err => {
    console.error("Fatal test error:", err);
    process.exit(1);
});
