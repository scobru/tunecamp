import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import { createFedify } from '../fedify.js';
import { createDatabase } from '../../../core/database.js';
import type { ServerConfig } from '../../../core/config.js';

describe('createFedify dispatchers (GET routes)', () => {
    let db: ReturnType<typeof createDatabase>;
    let federation: any;
    const config = { siteName: 'Test Instance', publicUrl: 'https://site.test' } as ServerConfig;

    beforeEach(() => {
        db = createDatabase(':memory:');
        federation = createFedify(db, config);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    async function fetchAp(path: string, accept = 'application/activity+json') {
        const req = new Request(`https://site.test${path}`, { headers: { Accept: accept } });
        return federation.fetch(req, { contextData: undefined });
    }

    function linkArtistToUser(artistId: number, username: string) {
        const userId = db.createUser(username, 'hash', artistId, 'artist');
        return userId;
    }

    describe('nodeinfo dispatcher', () => {
        test('returns instance software metadata using configured publicUrl', async () => {
            const res = await fetchAp('/nodeinfo/2.1', 'application/json');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.software.name).toBe('tunecamp');
            expect(json.protocols).toContain('activitypub');
            expect(json.metadata.actorId).toBe('https://site.test/users/site');
            expect(json.metadata.nodeName).toBe('Test Instance');
        });

        test('falls back to request origin when publicUrl is not configured', async () => {
            const bareFederation = createFedify(db, {} as ServerConfig);
            const req = new Request('https://origin.test/nodeinfo/2.1', { headers: { Accept: 'application/json' } });
            const res = await bareFederation.fetch(req, { contextData: undefined });
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.metadata.actorId).toBe('https://origin.test/users/site');
            expect(json.metadata.nodeName).toBe('TuneCamp');
        });
    });

    describe('actor dispatcher', () => {
        test('renders the site actor as a Service', async () => {
            const res = await fetchAp('/users/site');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.type).toBe('Service');
            expect(json.preferredUsername).toBe('site');
            expect(json.id).toBe('https://site.test/users/site');
        });

        test('renders a user-linked artist as a Person without a key when none is set', async () => {
            const artistId = db.createArtist('Test Artist');
            linkArtistToUser(artistId, 'artistowner');

            const res = await fetchAp('/users/test-artist');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.type).toBe('Person');
            expect(json.preferredUsername).toBe('test-artist');
            expect(json.publicKey).toBeUndefined();
        });

        test('renders a user-linked artist with an imported RSA public key', async () => {
            const artistId = db.createArtist('Keyed Artist');
            linkArtistToUser(artistId, 'keyedowner');
            const keyPair = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });
            db.updateArtistKeys(artistId, keyPair.publicKey, keyPair.privateKey);

            const res = await fetchAp('/users/keyed-artist');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.publicKey).toBeDefined();
            expect(json.publicKey.id).toBe('https://site.test/users/keyed-artist#main-key');
        });

        test('falls back to a regular user account when the handle is not an artist slug', async () => {
            const keyPair = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });
            const userId = db.createUser('plainuser', 'hash');
            db.db.prepare('UPDATE admin SET ap_public_key = ?, ap_private_key = ? WHERE id = ?')
                .run(keyPair.publicKey, keyPair.privateKey, userId);

            const res = await fetchAp('/users/plainuser');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.type).toBe('Person');
            expect(json.preferredUsername).toBe('plainuser');
        });

        test('returns 404 for an unknown handle', async () => {
            const res = await fetchAp('/users/nobody');
            expect(res.status).toBe(404);
        });

        test('artist not linked to any user account is not resolvable by slug', async () => {
            db.createArtist('Unlinked Artist');
            const res = await fetchAp('/users/unlinked-artist');
            expect(res.status).toBe(404);
        });
    });

    describe('object dispatcher (Audio)', () => {
        test('returns Audio metadata for an existing track', async () => {
            const artistId = db.createArtist('Track Owner');
            const adminRes = db.db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run('trackowner', 'hash');
            const ownerId = Number(adminRes.lastInsertRowid);
            const trackId = db.createTrack({
                title: 'Test Song',
                album_id: null,
                artist_id: artistId,
                owner_id: ownerId,
                track_num: 1,
                duration: 180,
                file_path: 'tracks/song.mp3',
                format: 'mp3',
                bitrate: 320,
                sample_rate: 44100,
                price: 0,
                currency: 'ETH',
                lossless_path: null,
                waveform: null,
                hash: 'hash',
            } as any);

            const res = await fetchAp(`/audio/${trackId}`);
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.type).toBe('Audio');
            expect(json.name).toBe('Test Song');
            expect(json.mediaType).toBe('audio/mpeg');
        });

        test('returns 404 for a non-existent track', async () => {
            const res = await fetchAp('/audio/999999');
            expect(res.status).toBe(404);
        });
    });

    describe('outbox dispatcher', () => {
        test('returns an empty collection for the site actor', async () => {
            const res = await fetchAp('/users/site/outbox');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.type).toContain('Collection');
        });

        test('includes public posts as Create/Article activities', async () => {
            const artistId = db.createArtist('Poster');
            linkArtistToUser(artistId, 'posterowner');
            db.createPost(artistId, 'Hello federated world', 'public', 'My Post');

            const res = await fetchAp('/users/poster/outbox');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.orderedItems ?? json.items).toBeDefined();
        });

        test('includes a public release with tracks as a Create/Audio activity', async () => {
            const artistId = db.createArtist('Track Release Artist');
            const ownerId = linkArtistToUser(artistId, 'trackreleaseowner');
            const releaseId = db.createRelease({
                title: 'My Release',
                artist_id: artistId,
                owner_id: ownerId,
                visibility: 'private',
                is_release: true,
            } as any);
            db.updateRelease(releaseId, { visibility: 'public' });
            db.createTrack({
                title: 'Lead Single',
                album_id: releaseId,
                artist_id: artistId,
                owner_id: ownerId,
                track_num: 1,
                duration: 200,
                file_path: 'tracks/lead.mp3',
                format: 'mp3',
                bitrate: 320,
                sample_rate: 44100,
                price: 0,
                currency: 'ETH',
                lossless_path: null,
                waveform: null,
                hash: 'lead-hash',
            } as any);

            const res = await fetchAp('/users/track-release-artist/outbox');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            const items = json.orderedItems ?? json.items;
            const releaseActivity = items.find((i: any) => i.object?.type === 'Audio');
            expect(releaseActivity).toBeDefined();
            expect(releaseActivity.object.name).toContain('Lead Single');
        });

        test('includes a public release with no tracks as a Create/Note activity', async () => {
            const artistId = db.createArtist('Trackless Release Artist');
            const ownerId = linkArtistToUser(artistId, 'tracklessowner');
            const releaseId = db.createRelease({
                title: 'Announcement Only',
                artist_id: artistId,
                owner_id: ownerId,
                visibility: 'private',
                is_release: true,
            } as any);
            db.updateRelease(releaseId, { visibility: 'public' });

            const res = await fetchAp('/users/trackless-release-artist/outbox');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            const items = json.orderedItems ?? json.items;
            const releaseActivity = items.find((i: any) => i.object?.type === 'Note');
            expect(releaseActivity).toBeDefined();
            expect(releaseActivity.object.content).toContain('Announcement Only');
        });

        test('extracts a markdown image from a post as an attachment and strips it from the content', async () => {
            const artistId = db.createArtist('Image Poster');
            linkArtistToUser(artistId, 'imageposter');
            db.createPost(artistId, 'Check this out! ![cover art](https://cdn.test/cover.png) Great stuff.', 'public', 'Visual Post');

            const res = await fetchAp('/users/image-poster/outbox');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            const items = json.orderedItems ?? json.items;
            const postActivity = items.find((i: any) => i.object?.type === 'Article');
            expect(postActivity).toBeDefined();
            const attachments = Array.isArray(postActivity.object.attachment) ? postActivity.object.attachment : [postActivity.object.attachment];
            expect(attachments[0].url).toBe('https://cdn.test/cover.png');
            expect(postActivity.object.content).not.toContain('![cover art]');
        });

        test('returns 404 for an unknown artist handle', async () => {
            const res = await fetchAp('/users/ghost/outbox');
            expect(res.status).toBe(404);
        });
    });

    describe('followers dispatcher', () => {
        test('lists accepted followers with a resolvable inbox', async () => {
            const artistId = db.createArtist('Followed Artist');
            linkArtistToUser(artistId, 'followedowner');
            db.addFollower(artistId, 'https://remote.test/users/alice', 'https://remote.test/users/alice/inbox');
            db.acceptFollower(artistId, 'https://remote.test/users/alice');
            // Pending follower must not appear in the collection.
            db.addFollower(artistId, 'https://remote.test/users/pending', 'https://remote.test/users/pending/inbox');

            const res = await fetchAp('/users/followed-artist/followers');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            const items = json.items ?? json.orderedItems ?? [];
            expect(items.length).toBe(1);
        });

        test('returns 404 for an unknown artist handle', async () => {
            const res = await fetchAp('/users/ghost/followers');
            expect(res.status).toBe(404);
        });

        test('resolves followers for the site actor', async () => {
            db.addFollower(-1, 'https://remote.test/users/bob', 'https://remote.test/users/bob/inbox');
            db.acceptFollower(-1, 'https://remote.test/users/bob');

            const res = await fetchAp('/users/site/followers');
            expect(res.status).toBe(200);
        });
    });

    describe('following dispatcher', () => {
        test('is always an empty collection', async () => {
            const artistId = db.createArtist('Follows Nobody');
            linkArtistToUser(artistId, 'followsnobody');
            const res = await fetchAp('/users/follows-nobody/following');
            expect(res.status).toBe(200);
            const json: any = await res.json();
            const items = json.items ?? json.orderedItems ?? [];
            expect(items.length).toBe(0);
        });
    });
});
