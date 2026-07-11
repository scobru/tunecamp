import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { ReleaseTrackRepository } from '../release-track.repository.js';
import { TrackRepository } from '../track.repository.js';
import { AlbumRepository } from '../album.repository.js';

describe('ReleaseTrackRepository', () => {
    let db: any;
    let repo: ReleaseTrackRepository;
    let trackRepo: TrackRepository;
    let albumRepo: AlbumRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new ReleaseTrackRepository(db.db);
        trackRepo = new TrackRepository(db.db);
        albumRepo = new AlbumRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    const createRelease = () => albumRepo.createRelease({ title: 'Test Release', is_release: true, visibility: 'public', status: 'released' } as any);

    test('add should insert a new track', () => {
        const albumId = createRelease();
        const trackId = repo.add(albumId, { title: 'Test Track', track_num: 1, duration: 180, price: 10, currency: 'ETH' });

        expect(trackId).toBeGreaterThan(0);
        const track = repo.getById(trackId);
        expect(track).toBeDefined();
        expect(track?.title).toBe('Test Track');
        expect(track?.release_id).toBe(albumId);
        expect(track?.track_num).toBe(1);
    });

    test('add should update an existing track', () => {
        const albumId = createRelease();
        const trackId = trackRepo.create({ title: 'Existing Track' } as any);

        const updatedTrackId = repo.add(albumId, { track_id: trackId, price: 20, currency: 'USDC' });
        expect(updatedTrackId).toBe(trackId);

        const track = trackRepo.getById(trackId);
        expect(track?.album_id).toBe(albumId);
        expect(track?.price).toBe(20);
        expect(track?.currency).toBe('USDC');
    });

    test('getByReleaseId should return tracks ordered by track_num', () => {
        const albumId = createRelease();
        repo.add(albumId, { title: 'Track 2', track_num: 2 });
        repo.add(albumId, { title: 'Track 1', track_num: 1 });
        repo.add(albumId, { title: 'Track 3', track_num: 3 });

        const tracks = repo.getByReleaseId(albumId);
        expect(tracks).toHaveLength(3);
        expect(tracks[0].title).toBe('Track 1');
        expect(tracks[1].title).toBe('Track 2');
        expect(tracks[2].title).toBe('Track 3');
    });

    test('getPriceFromRelease should return track pricing', () => {
        const albumId = createRelease();
        const trackId = repo.add(albumId, { title: 'Test Track', track_num: 1, price: 15, price_usdc: 15, currency: 'ETH' });

        const pricing = repo.getPriceFromRelease(albumId, trackId);
        expect(pricing).toBeDefined();
        expect(pricing?.price).toBe(15);
        expect(pricing?.price_usdc).toBe(15);
        expect(pricing?.currency).toBe('ETH');
        expect(pricing?.title).toBe('Test Track');
    });

    test('update should modify track metadata by id', () => {
        const albumId = createRelease();
        const trackId = repo.add(albumId, { title: 'Test Track', track_num: 1 });

        repo.update(trackId, { title: 'Updated Track', duration: 200 });

        const track = repo.getById(trackId);
        expect(track?.title).toBe('Updated Track');
        expect(track?.duration).toBe(200);
    });

    test('updateMetadata should modify track metadata by release and id', () => {
        const albumId = createRelease();
        const trackId = repo.add(albumId, { title: 'Test Track', track_num: 1 });

        repo.updateMetadata(albumId, trackId, { title: 'Updated Metadata Track' });

        const track = repo.getById(trackId);
        expect(track?.title).toBe('Updated Metadata Track');
    });

    test('remove should unlink a track from a release', () => {
        const albumId = createRelease();
        const trackId = repo.add(albumId, { title: 'Test Track', track_num: 1 });

        repo.remove(albumId, trackId);

        const track = trackRepo.getById(trackId);
        expect(track?.album_id).toBeNull();
    });

    test('removeBatch should unlink multiple tracks from a release', () => {
        const albumId = createRelease();
        const trackId1 = repo.add(albumId, { title: 'Test Track 1', track_num: 1 });
        const trackId2 = repo.add(albumId, { title: 'Test Track 2', track_num: 2 });

        repo.removeBatch(albumId, [trackId1, trackId2]);

        expect(trackRepo.getById(trackId1)?.album_id).toBeNull();
        expect(trackRepo.getById(trackId2)?.album_id).toBeNull();
    });

    test('delete should delete track completely', () => {
        const albumId = createRelease();
        const trackId = repo.add(albumId, { title: 'Test Track', track_num: 1 });

        repo.delete(trackId);
        expect(repo.getById(trackId)).toBeUndefined();
    });

    test('deleteByRelease should unlink all tracks from a release', () => {
        const albumId = createRelease();
        const trackId1 = repo.add(albumId, { title: 'Test Track 1', track_num: 1 });
        const trackId2 = repo.add(albumId, { title: 'Test Track 2', track_num: 2 });

        repo.deleteByRelease(albumId);

        expect(trackRepo.getById(trackId1)?.album_id).toBeNull();
        expect(trackRepo.getById(trackId2)?.album_id).toBeNull();
    });

    test('updateOrder should modify track_num based on array order', () => {
        const albumId = createRelease();
        const trackId1 = repo.add(albumId, { title: 'Track A', track_num: 1 });
        const trackId2 = repo.add(albumId, { title: 'Track B', track_num: 2 });
        const trackId3 = repo.add(albumId, { title: 'Track C', track_num: 3 });

        repo.updateOrder(albumId, [trackId3, trackId1, trackId2]);

        const tracks = repo.getByReleaseId(albumId);
        expect(tracks[0].id).toBe(trackId3);
        expect(tracks[0].track_num).toBe(1);
        expect(tracks[1].id).toBe(trackId1);
        expect(tracks[1].track_num).toBe(2);
        expect(tracks[2].id).toBe(trackId2);
        expect(tracks[2].track_num).toBe(3);
    });

    test('sync should unlink existing and link new tracks in order', () => {
        const albumId = createRelease();
        const trackId1 = repo.add(albumId, { title: 'Track A', track_num: 1 });
        const trackId2 = repo.add(albumId, { title: 'Track B', track_num: 2 });

        const trackId3 = trackRepo.create({ title: 'Track C' } as any);

        repo.sync(albumId, [trackId3, trackId1]);

        expect(trackRepo.getById(trackId2)?.album_id).toBeNull();

        const tracks = repo.getByReleaseId(albumId);
        expect(tracks).toHaveLength(2);
        expect(tracks[0].id).toBe(trackId3);
        expect(tracks[0].track_num).toBe(1);
        expect(tracks[1].id).toBe(trackId1);
        expect(tracks[1].track_num).toBe(2);
    });

    test('cleanUpGhostTracks should delete tracks without file_path', () => {
        const albumId = createRelease();
        const ghostTrackId = repo.add(albumId, { title: 'Ghost Track', file_path: null });
        const realTrackId = repo.add(albumId, { title: 'Real Track', file_path: 'path/to/file.mp3' });

        repo.cleanUpGhostTracks(albumId);

        expect(repo.getById(ghostTrackId)).toBeUndefined();
        expect(repo.getById(realTrackId)).toBeDefined();
    });
});
