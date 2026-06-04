import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { ArtistRepository } from '../artist.repository.js';
import { UserRole } from '../../common/visibility.js';

const ADMIN_CTX = { role: UserRole.ROOT_ADMIN };

describe('ArtistRepository', () => {
    let db: any;
    let repo: ArtistRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new ArtistRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('create', () => {
        test('creates an artist and returns its id, slugifying the name', () => {
            const id = repo.create('Daft Punk');
            expect(typeof id).toBe('number');

            const artist = repo.getById(id);
            expect(artist?.name).toBe('Daft Punk');
            expect(artist?.slug).toBe('daft-punk');
        });

        test('generates a unique slug when two distinct names collide', () => {
            // names are UNIQUE, but both slugify to "sigur-ros"
            const id1 = repo.create('Sigur Ros');
            const id2 = repo.create('Sigur!Ros');
            const a1 = repo.getById(id1);
            const a2 = repo.getById(id2);
            expect(a1?.slug).toBe('sigur-ros');
            expect(a2?.slug).toBe('sigur-ros-1');
            expect(id1).not.toBe(id2);
        });

        test('falls back to "artist" slug when the name has no slug-able chars', () => {
            const id = repo.create('!!!');
            expect(repo.getById(id)?.slug).toBe('artist');
        });

        test('persists bio, links and visibility', () => {
            const id = repo.create('A', 'a bio', undefined, [{ platform: 'web', url: 'https://a.com' }], undefined, undefined, 'public');
            const a = repo.getById(id);
            expect(a?.bio).toBe('a bio');
            expect(a?.visibility).toBe('public');
            expect(a?.links).toEqual([{ platform: 'web', url: 'https://a.com' }]);
        });
    });

    describe('lookups', () => {
        test('getBySlug and getByName resolve the same artist', () => {
            const id = repo.create('The Beatles');
            expect(repo.getBySlug('the-beatles')?.id).toBe(id);
            expect(repo.getByName('The Beatles')?.id).toBe(id);
        });

        test('getByName is case-insensitive', () => {
            const id = repo.create('Radiohead');
            expect(repo.getByName('radiohead')?.id).toBe(id);
        });

        test('missing artist returns undefined', () => {
            expect(repo.getById(99999)).toBeUndefined();
            expect(repo.getBySlug('nope')).toBeUndefined();
            expect(repo.getByName('nope')).toBeUndefined();
        });

        test('getByIds returns the requested artists and [] for empty input', () => {
            const a = repo.create('A');
            const b = repo.create('B');
            const rows = repo.getByIds([a, b]);
            expect(rows.map(r => r.id).sort()).toEqual([a, b].sort());
            expect(repo.getByIds([])).toEqual([]);
        });
    });

    describe('links parsing', () => {
        test('malformed links json degrades to an empty array', () => {
            const id = repo.create('Corrupt');
            db.db.prepare('UPDATE artists SET links = ? WHERE id = ?').run('{not json', id);
            const a = repo.getById(id);
            expect(a?.links).toEqual([]);
        });

        test('a links object (non-array) degrades to an empty array', () => {
            const id = repo.create('Obj');
            db.db.prepare('UPDATE artists SET links = ? WHERE id = ?').run('{"a":1}', id);
            expect(repo.getById(id)?.links).toEqual([]);
        });
    });

    describe('getAll visibility', () => {
        test('guests only see public/unlisted artists, admins see all', () => {
            repo.create('Public', undefined, undefined, undefined, undefined, undefined, 'public');
            repo.create('Private', undefined, undefined, undefined, undefined, undefined, 'private');

            const guestNames = repo.getAll().map(a => a.name);
            expect(guestNames).toContain('Public');
            expect(guestNames).not.toContain('Private');

            const adminNames = repo.getAll(ADMIN_CTX).map(a => a.name);
            expect(adminNames).toContain('Public');
            expect(adminNames).toContain('Private');
        });
    });

    describe('update', () => {
        test('updates only provided fields, leaving others intact (COALESCE)', () => {
            const id = repo.create('Original', 'original bio');
            repo.update(id, 'Renamed');
            const a = repo.getById(id);
            expect(a?.name).toBe('Renamed');
            expect(a?.bio).toBe('original bio');
        });
    });

    describe('delete', () => {
        test('removes the artist', () => {
            const before = repo.getCount();
            const id = repo.create('Doomed');
            expect(repo.getCount()).toBe(before + 1);
            repo.delete(id);
            expect(repo.getById(id)).toBeUndefined();
            expect(repo.getCount()).toBe(before);
        });
    });

    describe('getMissingMetadata', () => {
        test('finds artists missing a photo', () => {
            const withPhoto = repo.create('HasPhoto', undefined, '/cover.jpg');
            const withoutPhoto = repo.create('NoPhoto');
            const ids = repo.getMissingMetadata('photo').map(a => a.id);
            expect(ids).toContain(withoutPhoto);
            expect(ids).not.toContain(withPhoto);
        });

        test('finds artists missing a bio', () => {
            const withBio = repo.create('HasBio', 'a bio');
            const withoutBio = repo.create('NoBio');
            const ids = repo.getMissingMetadata('bio').map(a => a.id);
            expect(ids).toContain(withoutBio);
            expect(ids).not.toContain(withBio);
        });
    });
});
