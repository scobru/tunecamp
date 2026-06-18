import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { mockDbClient } from 'disconnect';
import { DiscogsProvider } from '../discogs.provider.js';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('DiscogsProvider', () => {
    let provider: DiscogsProvider;

    beforeEach(() => {
        provider = new DiscogsProvider();
    });

    test('has the expected provider identity', () => {
        expect(provider.id).toBe('discogs');
        expect(provider.name).toBe('Discogs');
    });

    describe('searchRelease', () => {
        test('maps results, splitting "Artist - Title" titles', async () => {
            (mockDbClient.search as any).mockImplementationOnce((_params: any, cb: any) =>
                cb(null, {
                    results: [{
                        id: 42,
                        title: 'Daft Punk - Discovery',
                        year: '2001',
                        genre: ['Electronic'],
                        cover_image: 'https://img/cover.jpg'
                    }]
                })
            );

            const [r] = await provider.searchRelease('Daft Punk Discovery');
            expect(r.id).toBe('42');
            expect(r.artist).toBe('Daft Punk');
            expect(r.title).toBe('Discovery');
            expect(r.year).toBe(2001);
            expect(r.genre).toBe('Electronic');
            expect(r.coverUrl).toBe('https://img/cover.jpg');
            expect(r.source).toBe('discogs');
        });

        test('treats an HTML/parse error from disconnect as empty results', async () => {
            (mockDbClient.search as any).mockImplementationOnce((_params: any, cb: any) =>
                cb(new Error('Unexpected token < in JSON at position 0'), null)
            );
            expect(await provider.searchRelease('q')).toEqual([]);
        });

        test('returns [] when a real error is thrown', async () => {
            (mockDbClient.search as any).mockImplementationOnce((_params: any, cb: any) =>
                cb(new Error('rate limited'), null)
            );
            expect(await provider.searchRelease('q')).toEqual([]);
        });

        test('handles an empty/absent results array', async () => {
            (mockDbClient.search as any).mockImplementationOnce((_params: any, cb: any) => cb(null, {}));
            expect(await provider.searchRelease('q')).toEqual([]);
        });
    });

    describe('searchRecording', () => {
        test('delegates to searchRelease', async () => {
            (mockDbClient.search as any).mockImplementationOnce((_params: any, cb: any) =>
                cb(null, { results: [{ id: 1, title: 'A - B' }] })
            );
            const [r] = await provider.searchRecording('A B');
            expect(r.id).toBe('1');
            expect(mockDbClient.search).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'release' }),
                expect.any(Function)
            );
        });
    });

    describe('getCoverUrl', () => {
        test('returns the first image resource url', async () => {
            (mockDbClient.getRelease as any).mockImplementationOnce((_id: any, cb: any) =>
                cb(null, { images: [{ resource_url: 'https://img/full.jpg' }] })
            );
            expect(await provider.getCoverUrl('42')).toBe('https://img/full.jpg');
        });

        test('returns null when there are no images', async () => {
            (mockDbClient.getRelease as any).mockImplementationOnce((_id: any, cb: any) => cb(null, {}));
            expect(await provider.getCoverUrl('42')).toBeNull();
        });

        test('returns null on error', async () => {
            (mockDbClient.getRelease as any).mockImplementationOnce((_id: any, cb: any) =>
                cb(new Error('boom'), null)
            );
            expect(await provider.getCoverUrl('42')).toBeNull();
        });
    });

    describe('searchArtist', () => {
        test('maps artist results', async () => {
            (mockDbClient.search as any).mockImplementationOnce((_params: any, cb: any) =>
                cb(null, { results: [{ id: 7, title: 'Daft Punk', thumb: 'https://img/thumb.jpg' }] })
            );
            const [a] = await provider.searchArtist('Daft Punk');
            expect(a.id).toBe('7');
            expect(a.name).toBe('Daft Punk');
            expect(a.avatarUrl).toBe('https://img/thumb.jpg');
            expect(mockDbClient.search).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'artist' }),
                expect.any(Function)
            );
        });
    });
});
