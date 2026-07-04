import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { TrackRepository } from '../track.repository.js';
import { ArtistRepository } from '../artist.repository.js';
import { UserRole } from '../../common/visibility.js';

const ADMIN_CTX = { role: UserRole.ROOT_ADMIN };

// Minimal valid track payload; callers override what they care about.
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

describe('TrackRepository', () => {
    let db: any;
    let repo: TrackRepository;
    let artists: ArtistRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new TrackRepository(db.db);
        artists = new ArtistRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('create', () => {
        test('creates a track and returns its id', () => {
            const id = repo.create(trackInput({ title: 'Hello', hash: 'h1' }));
            expect(typeof id).toBe('number');
            const t = repo.getById(id);
            expect(t?.title).toBe('Hello');
            expect(t?.currency).toBe('ETH');
        });

        test('keeps a valid artist_id foreign key', () => {
            const artistId = artists.create('Real Artist');
            const id = repo.create(trackInput({ artist_id: artistId, hash: 'h2' }));
            expect(repo.getById(id)?.artist_id).toBe(artistId);
        });

        test('nulls out an invalid artist_id (FK safeguard)', () => {
            const id = repo.create(trackInput({ artist_id: 424242, hash: 'h3' }));
            expect(repo.getById(id)?.artist_id).toBeNull();
        });

        test('nulls out an invalid album_id (FK safeguard)', () => {
            const id = repo.create(trackInput({ album_id: 999999, hash: 'h4' }));
            expect(repo.getById(id)?.album_id).toBeNull();
        });
    });

    describe('lookups', () => {
        test('getByHash finds the track', () => {
            repo.create(trackInput({ title: 'Hashed', hash: 'unique-hash' }));
            expect(repo.getByHash('unique-hash')?.title).toBe('Hashed');
            expect(repo.getByHash('missing')).toBeUndefined();
        });

        test('getByExternalId finds the track', () => {
            repo.create(trackInput({ title: 'Ext', hash: 'h5', external_id: 'spotify:track:1' }));
            expect(repo.getByExternalId('spotify:track:1')?.title).toBe('Ext');
            expect(repo.getByExternalId('nope')).toBeUndefined();
        });

        test('getByPath finds the track by its file path', () => {
            repo.create(trackInput({ title: 'Pathed', hash: 'h6', file_path: 'tracks/special.flac' }));
            expect(repo.getByPath('tracks/special.flac')?.title).toBe('Pathed');
        });

        test('getByIds returns matching tracks and [] for empty input', () => {
            const a = repo.create(trackInput({ title: 'A', hash: 'ha' }));
            const b = repo.create(trackInput({ title: 'B', hash: 'hb' }));
            const rows = repo.getByIds([a, b]);
            expect(rows.map(r => r.id).sort()).toEqual([a, b].sort());
            expect(repo.getByIds([])).toEqual([]);
        });

        test('missing track returns undefined', () => {
            expect(repo.getById(999999)).toBeUndefined();
        });
    });

    describe('isPublicReleaseTrack', () => {
        // Insert an album with explicit release/visibility/status, return its id.
        const makeAlbum = (slug: string, o: { is_release: number; status: string; visibility: string }) =>
            Number(db.db.prepare(
                "INSERT INTO albums (title, slug, is_release, status, visibility) VALUES (?, ?, ?, ?, ?)"
            ).run(slug, slug, o.is_release, o.status, o.visibility).lastInsertRowid);

        test('true for a track on a public, released release', () => {
            const albumId = makeAlbum('pub', { is_release: 1, status: 'released', visibility: 'public' });
            const id = repo.create(trackInput({ hash: 'p1', album_id: albumId }));
            expect(repo.isPublicReleaseTrack(id)).toBe(true);
        });

        test('true for an unlisted released release', () => {
            const albumId = makeAlbum('unl', { is_release: 1, status: 'released', visibility: 'unlisted' });
            const id = repo.create(trackInput({ hash: 'p2', album_id: albumId }));
            expect(repo.isPublicReleaseTrack(id)).toBe(true);
        });

        test('false for a private library track', () => {
            const albumId = makeAlbum('lib', { is_release: 0, status: 'draft', visibility: 'private' });
            const id = repo.create(trackInput({ hash: 'p3', album_id: albumId }));
            expect(repo.isPublicReleaseTrack(id)).toBe(false);
        });

        test('false for a hidden/private release (not publicly visible)', () => {
            // A release the artist has taken down: is_release stays 1 but visibility is private,
            // so status is NOT auto-released by the insert trigger.
            const albumId = makeAlbum('hidden', { is_release: 1, status: 'draft', visibility: 'private' });
            const id = repo.create(trackInput({ hash: 'p4', album_id: albumId }));
            expect(repo.isPublicReleaseTrack(id)).toBe(false);
        });

        test('false for a released album not marked as a release', () => {
            const albumId = makeAlbum('notrel', { is_release: 0, status: 'released', visibility: 'public' });
            const id = repo.create(trackInput({ hash: 'p5', album_id: albumId }));
            expect(repo.isPublicReleaseTrack(id)).toBe(false);
        });

        test('false for a track with no album', () => {
            const id = repo.create(trackInput({ hash: 'p6', album_id: null }));
            expect(repo.isPublicReleaseTrack(id)).toBe(false);
        });
    });

    describe('update', () => {
        test('updates fields and maps camelCase keys to columns', () => {
            const id = repo.create(trackInput({ title: 'Before', hash: 'h7' }));
            repo.update(id, { title: 'After', trackNum: 5 } as any);
            const t = repo.getById(id);
            expect(t?.title).toBe('After');
            expect(t?.track_num).toBe(5);
        });
    });

    describe('ownership', () => {
        test('addOwner/getTrackOwners/removeOwner manage owners (valid admin id)', () => {
            const ownerId = Number(db.db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
            const id = repo.create(trackInput({ title: 'Owned', hash: 'h8' }));

            repo.addOwner(id, ownerId);
            expect(repo.getTrackOwners(id)).toContain(ownerId);

            repo.removeOwner(id, ownerId);
            expect(repo.getTrackOwners(id)).not.toContain(ownerId);
        });

        test('addOwner skips an invalid (non-admin) owner id', () => {
            const id = repo.create(trackInput({ title: 'NoOwner', hash: 'h9' }));
            repo.addOwner(id, 777777);
            expect(repo.getTrackOwners(id)).toEqual([]);
        });
    });

    describe('delete', () => {
        test('deletes the track and its ownership rows', () => {
            const id = repo.create(trackInput({ title: 'Gone', hash: 'h10' }));
            expect(repo.getById(id)).toBeDefined();
            repo.delete(id);
            expect(repo.getById(id)).toBeUndefined();
        });
    });

    describe('counts and paths', () => {
        test('getCount reflects created tracks', () => {
            const before = repo.getCount();
            repo.create(trackInput({ title: 'C1', hash: 'c1' }));
            repo.create(trackInput({ title: 'C2', hash: 'c2' }));
            expect(repo.getCount()).toBe(before + 2);
        });

        test('getPaths returns file paths', () => {
            repo.create(trackInput({ title: 'P1', hash: 'p1', file_path: 'tracks/one.mp3' }));
            expect(repo.getPaths()).toContain('tracks/one.mp3');
        });
    });

    describe('getAll', () => {
        test('returns created tracks for an admin context', () => {
            repo.create(trackInput({ title: 'Visible', hash: 'v1' }));
            const titles = repo.getAll(ADMIN_CTX).map(t => t.title);
            expect(titles).toContain('Visible');
        });
    });

    describe('getMissingMetadata(cover)', () => {
        const makeAlbum = (slug: string, coverPath: string | null) =>
            Number(db.db.prepare(
                "INSERT INTO albums (title, slug, cover_path) VALUES (?, ?, ?)"
            ).run(slug, slug, coverPath).lastInsertRowid);

        test('track without album and without external artwork is missing', () => {
            const id = repo.create(trackInput({ title: 'Bare', hash: 'mc1' }));
            expect(repo.getMissingMetadata('cover').map(t => t.id)).toContain(id);
        });

        test('track in a coverless album is missing (regression: scanner folder albums)', () => {
            // The scanner assigns every track to an auto-generated folder album;
            // that must not hide a genuinely missing cover.
            const albumId = makeAlbum('no-cover', null);
            const id = repo.create(trackInput({ title: 'InFolder', hash: 'mc2', album_id: albumId }));
            expect(repo.getMissingMetadata('cover').map(t => t.id)).toContain(id);
        });

        test('track in an album with a real cover is not missing', () => {
            const albumId = makeAlbum('with-cover', 'artist/album/cover.jpg');
            const id = repo.create(trackInput({ title: 'Covered', hash: 'mc3', album_id: albumId }));
            expect(repo.getMissingMetadata('cover').map(t => t.id)).not.toContain(id);
        });

        test('track with external artwork is not missing', () => {
            const id = repo.create(trackInput({ title: 'ExtArt', hash: 'mc4', external_artwork: 'https://img/cover.jpg' } as any));
            expect(repo.getMissingMetadata('cover').map(t => t.id)).not.toContain(id);
        });
    });
});
