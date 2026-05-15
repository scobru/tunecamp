
import { createDatabase } from "../../../core/database.js";
import fs from "fs";
import path from "path";

const DB_PATH = "bench_tunecamp.db";

describe("ActivityPub Outbox Performance", () => {
    let dbService: ReturnType<typeof createDatabase>;

    beforeAll(() => {
        if (fs.existsSync(DB_PATH)) {
            fs.unlinkSync(DB_PATH);
        }
        dbService = createDatabase(DB_PATH);

        // Seed data
        // Create an admin user to satisfy FK constraints for owner_id
        (dbService as any).db.prepare("INSERT INTO admin (username, password_hash, role) VALUES ('bench', 'hash', 'admin')").run();
        const artistId = dbService.createArtist("Test Artist");

        // Create 500 releases
        for (let i = 0; i < 500; i++) {
            const albumId = dbService.createAlbum({
                title: `Release ${i}`,
                slug: `release-${i}`,
                artist_id: artistId,
                date: "2023-01-01",
                is_public: true,
                visibility: 'public',
                is_release: true,
                cover_path: null,
                genre: "Rock",
                description: "Test release",
                download: null,
                external_links: null,
                published_at: new Date().toISOString(),
                type: 'album',
                year: 2023,
                published_to_gundb: false,
                published_to_ap: false,
                license: null,
                owner_id: artistId,
                price: 0,
                price_usdc: 0,
                currency: "USD",
                status: 'draft'
            });

            // Create 10 tracks per release
            for (let j = 0; j < 10; j++) {
                dbService.createTrack({
                    title: `Track ${j}`,
                    album_id: albumId,
                    artist_id: artistId,
                    track_num: j + 1,
                    duration: 180,
                    file_path: `/tmp/track_${i}_${j}.mp3`,
                    format: "mp3",
                    bitrate: 320,
                    sample_rate: 44100,
                    lossless_path: null,
                    waveform: null,
                    url: null,
                    service: null,
                    external_artwork: null,
                    owner_id: artistId,
                    price: 0,
                    price_usdc: 0,
                    currency: "USD"
                });
            }
        }
    });

    afterAll(() => {
        if (dbService && dbService.db) dbService.db.close();

        const cleanup = (filePath: string) => {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.warn(`⚠️ Could not delete ${filePath}: ${e}`);
                }
            }
        };

        cleanup(DB_PATH);
        cleanup(`${DB_PATH}-wal`);
        cleanup(`${DB_PATH}-shm`);
    });

    test("Benchmark N+1 vs Bulk Fetch", () => {
        const artist = dbService.getArtistByName("Test Artist")!;
        const albums = dbService.getAlbumsByArtist(artist.id, true);
        const releases = albums.filter((a: any) => a.is_release && a.is_public);

        // Measure N+1
        const startN1 = performance.now();
        let trackCountN1 = 0;
        for (const release of releases) {
            const tracks = dbService.getTracks(release.id);
            trackCountN1 += tracks.length;
        }
        const endN1 = performance.now();
        const timeN1 = endN1 - startN1;

        console.log(`N+1 Query Time: ${timeN1.toFixed(2)}ms for ${releases.length} releases and ${trackCountN1} tracks`);

        // Measure Bulk Fetch (Using implementation)
        const startBulk = performance.now();

        const releaseIds = releases.map((r: any) => r.id);
        const allTracks = dbService.getTracksByAlbumIds(releaseIds);

        // Group by album_id in memory
        const tracksByRelease = new Map<number, any[]>();
        for (const track of allTracks) {
            if (!tracksByRelease.has(track.album_id!)) {
                tracksByRelease.set(track.album_id!, []);
            }
            tracksByRelease.get(track.album_id!)!.push(track);
        }

        let trackCountBulk = 0;
        for (const release of releases) {
            const tracks = tracksByRelease.get(release.id) || [];
            trackCountBulk += tracks.length;
        }

        const endBulk = performance.now();
        const timeBulk = endBulk - startBulk;

        console.log(`Bulk Query Time: ${timeBulk.toFixed(2)}ms for ${releases.length} releases and ${trackCountBulk} tracks`);

        expect(trackCountBulk).toBe(trackCountN1);
    });
});

