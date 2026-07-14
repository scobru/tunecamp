import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { ReleaseTrackRepository } from '../release-track.repository.js';
import { AlbumRepository } from '../album.repository.js';
import { TrackRepository } from '../track.repository.js';
import { ArtistRepository } from '../artist.repository.js';
import { UserRole } from '../../common/visibility.js';

const ADMIN_CTX = { role: UserRole.ROOT_ADMIN };

function trackInput(overrides: Record<string, any> = {}) {
    return {
        title: 'Track',
        album_id: null,
        artist_id: null,
        owner_id: null,
        artist_name: 'An Artist',
        track_num: 1,
        duration: 200,
        file_path: 'tracks/track.mp3',
        format: 'mp3',
        bitrate: 320,
        sample_rate: 44100,
        price: 0,
        currency: 'ETH',
        lossless_path: null,
        waveform: null,
        hash: null,
        ...overrides
    } as any;
}

function albumInput(overrides: Record<string, any> = {}) {
    return {
        title: 'Album',
        artist_name: 'An Artist',
        type: 'album',
        visibility: 'public',
        is_release: 1,
        ...overrides
    } as any;
}

describe('ReleaseTrackRepository', () => {
    let db: any;
    let repo: ReleaseTrackRepository;
    let albums: AlbumRepository;
    let tracks: TrackRepository;
    let artists: ArtistRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new ReleaseTrackRepository(db.db);
        albums = new AlbumRepository(db.db, {} as any, {} as any); // Ignoring managers for now
        tracks = new TrackRepository(db.db);
        artists = new ArtistRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    test('add and getByReleaseId / getById', () => {
        const artistId = artists.create('Release Artist');
        const releaseId = albums.create(albumInput({ artist_id: artistId }));

        // Test add new track
        const trackId = repo.add(releaseId, {
            title: 'Track 1',
            price: 10,
            price_usdc: 15,
            currency: 'ETH'
        });

        expect(trackId).toBeDefined();

        // Test getByReleaseId
        const releaseTracks = repo.getByReleaseId(releaseId);
        expect(releaseTracks.length).toBe(1);
        expect(releaseTracks[0].title).toBe('Track 1');
        expect(releaseTracks[0].price).toBe(10);
        expect(releaseTracks[0].price_usdc).toBe(15);
        expect(releaseTracks[0].track_num).toBe(1);

        // Test getById
        const rt = repo.getById(trackId);
        expect(rt).toBeDefined();
        expect(rt?.title).toBe('Track 1');
    });

    test('add with existing track updates the track', () => {
        const artistId = artists.create('Release Artist');
        const releaseId = albums.create(albumInput({ artist_id: artistId }));

        const trackId = tracks.create(trackInput({ title: 'Old Title' }));

        repo.add(releaseId, {
            track_id: trackId,
            title: 'New Title via track repo add is ignored for update',
            price: 5
        });

        const rt = repo.getById(trackId);
        expect(rt?.release_id).toBe(releaseId);
        expect(rt?.price).toBe(5);
        // title is not updated in the UPDATE branch of add
        expect(rt?.title).toBe('Old Title');
    });

    test('getPriceFromRelease returns correct pricing', () => {
        const releaseId = albums.create(albumInput());
        const trackId = repo.add(releaseId, {
            title: 'Priced Track',
            price: 42,
            price_usdc: 4200,
            currency: 'ETH'
        });

        const price = repo.getPriceFromRelease(releaseId, trackId);
        expect(price).toBeDefined();
        expect(price?.price).toBe(42);
        expect(price?.price_usdc).toBe(4200);
        expect(price?.currency).toBe('ETH');
        expect(price?.title).toBe('Priced Track');

        // Non-existent
        expect(repo.getPriceFromRelease(releaseId, 9999)).toBeUndefined();
    });

    test('update modifies track fields', () => {
        const releaseId = albums.create(albumInput());
        const trackId = repo.add(releaseId, { title: 'Track' });

        repo.update(trackId, { title: 'Updated Track', duration: 120 });

        const rt = repo.getById(trackId);
        expect(rt?.title).toBe('Updated Track');
        expect(rt?.duration).toBe(120);
        // Should ignore protected fields
        repo.update(trackId, { id: 999, release_id: 999 } as any);
        expect(repo.getById(trackId)?.id).toBe(trackId);
    });

    test('updateMetadata modifies track fields scoped by release', () => {
        const releaseId = albums.create(albumInput());
        const trackId = repo.add(releaseId, { title: 'Track' });

        repo.updateMetadata(releaseId, trackId, { title: 'Updated Meta' });

        const rt = repo.getById(trackId);
        expect(rt?.title).toBe('Updated Meta');
    });

    test('remove and removeBatch unlinks tracks from release', () => {
        const releaseId = albums.create(albumInput());
        const t1 = repo.add(releaseId, { title: 'T1' });
        const t2 = repo.add(releaseId, { title: 'T2' });
        const t3 = repo.add(releaseId, { title: 'T3' });

        expect(repo.getByReleaseId(releaseId).length).toBe(3);

        repo.remove(releaseId, t1);
        expect(repo.getByReleaseId(releaseId).length).toBe(2);
        expect(repo.getById(t1)).toBeUndefined(); // It's no longer in the release view!

        repo.removeBatch(releaseId, [t2, t3]);
        expect(repo.getByReleaseId(releaseId).length).toBe(0);
        expect(repo.getById(t2)).toBeUndefined();
    });

    test('delete and deleteByRelease deletes or unlinks tracks', () => {
        const releaseId = albums.create(albumInput());
        const t1 = repo.add(releaseId, { title: 'T1' });
        const t2 = repo.add(releaseId, { title: 'T2' });

        repo.delete(t1);
        expect(repo.getById(t1)).toBeUndefined();

        repo.deleteByRelease(releaseId);
        expect(repo.getById(t2)).toBeUndefined(); // because it unlinked
    });

    test('updateOrder and sync manages track ordering and linking', () => {
        const releaseId = albums.create(albumInput());
        const t1 = tracks.create(trackInput({ title: 'T1' }));
        const t2 = tracks.create(trackInput({ title: 'T2' }));
        const t3 = tracks.create(trackInput({ title: 'T3' }));

        // Link and order using sync
        repo.sync(releaseId, [t2, t1, t3]);

        let rt = repo.getByReleaseId(releaseId);
        expect(rt.length).toBe(3);
        expect(rt.find(r => r.id === t2)?.track_num).toBe(1);
        expect(rt.find(r => r.id === t1)?.track_num).toBe(2);
        expect(rt.find(r => r.id === t3)?.track_num).toBe(3);

        // Update order
        repo.updateOrder(releaseId, [t3, t2, t1]);

        rt = repo.getByReleaseId(releaseId);
        expect(rt.find(r => r.id === t3)?.track_num).toBe(1);
        expect(rt.find(r => r.id === t2)?.track_num).toBe(2);
        expect(rt.find(r => r.id === t1)?.track_num).toBe(3);
    });

    test('cleanUpGhostTracks removes tracks with no file_path for a release', () => {
        const releaseId = albums.create(albumInput());
        const t1 = repo.add(releaseId, { title: 'Ghost', file_path: null });
        const t2 = repo.add(releaseId, { title: 'Real', file_path: 'some/path.mp3' });

        repo.cleanUpGhostTracks(releaseId);

        expect(repo.getById(t1)).toBeUndefined();
        expect(repo.getById(t2)).toBeDefined();
    });
});
