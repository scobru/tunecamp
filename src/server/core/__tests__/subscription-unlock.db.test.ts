import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabase } from '../database.js';

/**
 * Integration tests for the real SQLite layer behind the subscription and
 * unlock-code systems. The HTTP route tests mock the database, so these
 * exercise the actual SQL in database.ts against an in-memory database to
 * catch schema/query regressions (column names, defaults, FK constraints).
 */
describe('Database layer: subscriptions & unlock codes', () => {
    let db: any;
    let logSpy: any;
    let warnSpy: any;

    beforeAll(() => {
        // Suppress migration/insert chatter for a clean test run.
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    let adminId: number;
    let artistId: number;
    let albumId: number;
    let trackId: number;
    let assetId: number;

    beforeEach(() => {
        db = createDatabase(':memory:');

        adminId = db.createUser('fan', 'hashed-pw', null, 'user');
        artistId = db.createArtist('Test Artist');
        albumId = db.createAlbum({
            title: 'Test Album',
            artist_id: artistId,
            owner_id: adminId,
            price: 5,
            currency: 'USD',
            visibility: 'public',
        });
        trackId = db.createTrack({
            title: 'Test Track',
            album_id: albumId,
            artist_id: artistId,
            owner_id: adminId,
            track_num: 1,
            duration: 120,
            file_path: 'artist/album/track.mp3',
        });
        assetId = db.createAsset({
            title: 'Test Asset',
            artist_id: artistId,
            owner_id: adminId,
            file_path: 'artist/asset.zip',
            price: 3,
        });
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('Subscriptions', () => {
        test('a new user has no subscription by default', () => {
            const sub = db.getUserSubscription(adminId);
            expect(sub.status).toBe('none');
            expect(sub.expiresAt).toBeNull();
        });

        test('updateSubscription activates a user with an expiry date', () => {
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            db.updateSubscription(adminId, 'active', expiresAt);

            const sub = db.getUserSubscription(adminId);
            expect(sub.status).toBe('active');
            expect(sub.expiresAt).toBe(expiresAt);
        });

        test('subscription can be overwritten (e.g. renewal or cancellation)', () => {
            const first = new Date(Date.now() + 1000).toISOString();
            db.updateSubscription(adminId, 'active', first);

            const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
            db.updateSubscription(adminId, 'active', later);

            expect(db.getUserSubscription(adminId).expiresAt).toBe(later);

            db.updateSubscription(adminId, 'cancelled', later);
            expect(db.getUserSubscription(adminId).status).toBe('cancelled');
        });

        test('getUserSubscription for an unknown user reports no subscription', () => {
            const sub = db.getUserSubscription(999999);
            expect(sub.status).toBe('none');
            expect(sub.expiresAt).toBeNull();
        });

        test('updating an unknown user does not affect other users', () => {
            const expiresAt = new Date(Date.now() + 1000).toISOString();
            db.updateSubscription(999999, 'active', expiresAt);
            expect(db.getUserSubscription(adminId).status).toBe('none');
        });
    });

    describe('Unlock codes', () => {
        test('release-level code validates and resolves the release id', () => {
            db.createUnlockCode('ALBUMCODE1', albumId);

            const result = db.validateUnlockCode('ALBUMCODE1');
            expect(result.valid).toBe(true);
            expect(result.releaseId).toBe(albumId);
            expect(result.trackId).toBeNull();
            expect(result.isUsed).toBe(false);
        });

        test('track-level code resolves the track id', () => {
            db.createUnlockCode('TRACKCODE1', albumId, trackId);

            const result = db.validateUnlockCode('TRACKCODE1');
            expect(result.valid).toBe(true);
            expect(result.releaseId).toBe(albumId);
            expect(result.trackId).toBe(trackId);
        });

        test('asset-level code resolves the asset id', () => {
            db.createUnlockCode('ASSETCODE1', undefined, undefined, undefined, assetId);

            const result = db.validateUnlockCode('ASSETCODE1');
            expect(result.valid).toBe(true);
            expect(result.assetId).toBe(assetId);
        });

        test('an unknown code is reported invalid', () => {
            const result = db.validateUnlockCode('DOES-NOT-EXIST');
            expect(result.valid).toBe(false);
            expect(result.isUsed).toBe(false);
        });

        test('redeemUnlockCode marks the code as used', () => {
            db.createUnlockCode('REDEEMME1', albumId);
            expect(db.validateUnlockCode('REDEEMME1').isUsed).toBe(false);

            db.redeemUnlockCode('REDEEMME1');

            const result = db.validateUnlockCode('REDEEMME1');
            expect(result.valid).toBe(true); // still resolvable
            expect(result.isUsed).toBe(true);
        });

        test('duplicate codes are rejected by the UNIQUE constraint', () => {
            db.createUnlockCode('DUPLICATE1', albumId);
            // The admin/create route relies on this throw to trigger its retry path.
            expect(() => db.createUnlockCode('DUPLICATE1', albumId)).toThrow();
        });

        test('listUnlockCodes returns all codes and filters by release', () => {
            const otherAlbumId = db.createAlbum({
                title: 'Other Album',
                artist_id: artistId,
                owner_id: adminId,
                visibility: 'public',
            });

            db.createUnlockCode('LIST-A1', albumId);
            db.createUnlockCode('LIST-A2', albumId);
            db.createUnlockCode('LIST-B1', otherAlbumId);

            expect(db.listUnlockCodes()).toHaveLength(3);

            const forAlbum = db.listUnlockCodes(albumId);
            expect(forAlbum).toHaveLength(2);
            expect(forAlbum.map((c: any) => c.code).sort()).toEqual(['LIST-A1', 'LIST-A2']);
        });

        test('getUnlockCodeByTxHash powers replay protection', () => {
            const txHash = '0xabc123';
            expect(db.getUnlockCodeByTxHash(txHash)).toBeUndefined();

            db.createUnlockCode('TXCODE1', albumId, trackId, txHash);

            const found = db.getUnlockCodeByTxHash(txHash);
            expect(found).toBeTruthy();
            expect(found.code).toBe('TXCODE1');
            expect(found.tx_hash).toBe(txHash);
        });

        test('subscription verify codes are recorded with their tx hash for replay protection', () => {
            // Mirrors POST /subscription/verify: a SUB- code keyed only by tx hash.
            const txHash = '0xsubscription999';
            db.createUnlockCode('SUB-XYZ', undefined, undefined, txHash);

            expect(db.getUnlockCodeByTxHash(txHash).code).toBe('SUB-XYZ');
        });
    });
});
