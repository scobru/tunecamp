import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { AlbumRepository } from '../album.repository.js';
import { ArtistRepository } from '../artist.repository.js';
import { UserRole } from '../../common/visibility.js';

const ADMIN_CTX = { role: UserRole.ROOT_ADMIN };

function albumInput(overrides: Record<string, any> = {}) {
    return {
        title: 'Album',
        slug: undefined,
        artist_id: null,
        owner_id: null,
        date: '2020-01-01',
        cover_path: null,
        genre: 'Rock',
        description: '',
        type: 'album',
        year: 2020,
        download: null,
        price: 0,
        price_usdc: 0,
        currency: 'ETH',
        external_links: null,
        is_public: false,
        visibility: 'private',
        is_release: false,
        published_at: null,
        published_to_gundb: false,
        published_to_ap: false,
        use_nft: false,
        ...overrides
    } as any;
}

describe('AlbumRepository', () => {
    let db: any;
    let repo: AlbumRepository;
    let artists: ArtistRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new AlbumRepository(db.db);
        artists = new ArtistRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('create', () => {
        test('creates a library album and returns its id', () => {
            const id = repo.create(albumInput({ title: 'My Album' }));
            const a = repo.getById(id);
            expect(a?.title).toBe('My Album');
            expect(a?.is_release).toBe(false);
            expect(a?.currency).toBe('ETH');
        });

        test('derives a slug from the title when none is given', () => {
            const id = repo.create(albumInput({ title: 'Random Access Memories' }));
            expect(repo.getById(id)?.slug).toBe('random-access-memories');
        });

        test('generates a unique slug on collision', () => {
            const id1 = repo.create(albumInput({ title: 'Greatest Hits' }));
            const id2 = repo.create(albumInput({ title: 'Greatest Hits' }));
            expect(repo.getById(id1)?.slug).toBe('greatest-hits');
            expect(repo.getById(id2)?.slug).toBe('greatest-hits-1');
        });

        test('coerces booleans into integer columns', () => {
            const artistId = artists.create('Releaser');
            const id = repo.createRelease(albumInput({
                title: 'A Release', artist_id: artistId, is_release: true,
                visibility: 'public', status: 'released'
            }));
            const a = repo.getById(id);
            expect(a?.is_release).toBe(true);
        });
    });

    describe('lookups', () => {
        test('getBySlug resolves the album', () => {
            const id = repo.create(albumInput({ title: 'Slugged' }));
            expect(repo.getBySlug('slugged')?.id).toBe(id);
        });

        test('getByTitle resolves the album', () => {
            repo.create(albumInput({ title: 'Titled' }));
            expect(repo.getByTitle('Titled')?.title).toBe('Titled');
        });

        test('missing album returns undefined', () => {
            expect(repo.getById(999999)).toBeUndefined();
            expect(repo.getBySlug('nope')).toBeUndefined();
        });

        test('getByIds returns matching albums and [] for empty input', () => {
            const a = repo.create(albumInput({ title: 'IdA' }));
            const b = repo.create(albumInput({ title: 'IdB' }));
            const ids = repo.getByIds([a, b]).map(r => r.id).sort();
            expect(ids).toEqual([a, b].sort());
            expect(repo.getByIds([])).toEqual([]);
        });
    });

    describe('getLibraryAlbums', () => {
        test('admins see private library albums, guests do not', () => {
            repo.create(albumInput({ title: 'PrivateLib', visibility: 'private' }));
            const adminTitles = repo.getLibraryAlbums(ADMIN_CTX).map(a => a.title);
            expect(adminTitles).toContain('PrivateLib');

            const guestTitles = repo.getLibraryAlbums().map(a => a.title);
            expect(guestTitles).not.toContain('PrivateLib');
        });
    });

    describe('update', () => {
        test('updates simple fields', () => {
            const id = repo.create(albumInput({ title: 'Before', genre: 'Rock' }));
            repo.update(id, { genre: 'Jazz' });
            expect(repo.getById(id)?.genre).toBe('Jazz');
        });

        test('reverts public visibility on a non-release album (domain invariant)', () => {
            const id = repo.create(albumInput({ title: 'NotARelease', visibility: 'private', is_release: false }));
            repo.update(id, { visibility: 'public' });
            const a = repo.getById(id);
            expect(a?.visibility).toBe('private');
            expect(a?.is_public).toBe(false);
        });

        test('clears is_public when a public release is flipped to private (federation leak)', () => {
            const artistId = artists.create('Sealer');
            const id = repo.createRelease(albumInput({
                title: 'WasPublic', artist_id: artistId, is_release: true,
                visibility: 'public', status: 'released'
            }));
            // Simulate a release already broadcast to the public outbox.
            repo.update(id, { is_public: true });
            expect(repo.getById(id)?.is_public).toBe(true);

            // Mirrors what updateAlbumVisibility does: only the visibility column is sent.
            repo.update(id, { visibility: 'private' });
            const a = repo.getById(id);
            expect(a?.visibility).toBe('private');
            expect(a?.is_public).toBe(false);
        });

        test('sets is_public when a release is flipped to public/unlisted', () => {
            const artistId = artists.create('Opener');
            const id = repo.createRelease(albumInput({
                title: 'WasPrivate', artist_id: artistId, is_release: true,
                visibility: 'private', is_public: false, status: 'released'
            }));
            repo.update(id, { visibility: 'unlisted' });
            expect(repo.getById(id)?.is_public).toBe(true);
        });
    });

    describe('delete', () => {
        test('removes the album', () => {
            const id = repo.create(albumInput({ title: 'Doomed' }));
            expect(repo.getById(id)).toBeDefined();
            repo.delete(id);
            expect(repo.getById(id)).toBeUndefined();
        });
    });

    describe('promoteToRelease', () => {
        test('flips is_release and status to released', () => {
            const id = repo.create(albumInput({ title: 'Promote', visibility: 'public' }));
            repo.promoteToRelease(id);
            const a = repo.getById(id);
            expect(a?.is_release).toBe(true);
        });
    });

    describe('getCount', () => {
        test('reflects created albums', () => {
            const before = repo.getCount();
            repo.create(albumInput({ title: 'Count1' }));
            repo.create(albumInput({ title: 'Count2' }));
            expect(repo.getCount()).toBe(before + 2);
        });
    });
});
