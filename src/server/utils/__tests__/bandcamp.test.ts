import { jest } from '@jest/globals';
import { getTralbumCollectors, getFanCollection } from '../bandcamp.js';

describe('getTralbumCollectors', () => {
    let mockFetch: ReturnType<typeof jest.spyOn>;
    let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        mockFetch = jest.spyOn(global, 'fetch');
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns empty array on error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        const result = await getTralbumCollectors('a', 123);
        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('returns empty array on non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500
        } as Response);
        const result = await getTralbumCollectors('a', 123);
        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('fetches single page of collectors', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { fan_id: 1, username: 'user1', name: 'User 1', url: 'http://url1' },
                    { fan_id: 2, username: 'user2' }, // missing name and url
                    { username: 'user3' } // missing fan_id, should be skipped
                ],
                more_available: false
            })
        } as Response);

        const result = await getTralbumCollectors('t', 456);
        expect(result).toEqual([
            { fanId: 1, username: 'user1', name: 'User 1', url: 'http://url1' },
            { fanId: 2, username: 'user2', name: 'user2', url: 'https://bandcamp.com/user2' }
        ]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('paginates correctly using tokens', async () => {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        { fan_id: 1, username: 'user1', token: 'token1' },
                        { fan_id: 2, username: 'user2', token: 'token2' }
                    ],
                    more_available: true
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        { fan_id: 3, username: 'user3', token: 'token3' }
                    ],
                    more_available: false
                })
            } as Response);

        const result = await getTralbumCollectors('a', 123);
        expect(result).toHaveLength(3);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Check if token was passed correctly in second call
        const secondCallArg = mockFetch.mock.calls[1][1];
        const body = JSON.parse((secondCallArg as RequestInit).body as string);
        expect(body.token).toBe('token2');
    });

    it('stops at limit and slices results', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { fan_id: 1, username: 'user1' },
                    { fan_id: 2, username: 'user2' },
                    { fan_id: 3, username: 'user3' }
                ],
                more_available: false
            })
        } as Response);

        const result = await getTralbumCollectors('a', 123, 2);
        expect(result).toHaveLength(2);
        expect(result).toEqual([
            { fanId: 1, username: 'user1', name: 'user1', url: 'https://bandcamp.com/user1' },
            { fanId: 2, username: 'user2', name: 'user2', url: 'https://bandcamp.com/user2' }
        ]);
    });

    it('handles empty results array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: []
            })
        } as Response);
        const result = await getTralbumCollectors('a', 123);
        expect(result).toEqual([]);
    });

    it('handles missing fields gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { fan_id: 1 }, // missing username, name, url
                ],
                more_available: false
            })
        } as Response);

        const result = await getTralbumCollectors('a', 123);
        expect(result).toEqual([
            {
                fanId: 1,
                username: "",
                name: "Unknown",
                url: ""
            }
        ]);
    });
});

describe('getFanCollection', () => {
    let mockFetch: ReturnType<typeof jest.spyOn>;
    let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        mockFetch = jest.spyOn(global, 'fetch');
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns empty array on error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        const result = await getFanCollection(123);
        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('fetches single page of fan collection', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: [
                    {
                        tralbum_id: 1,
                        tralbum_type: 'a',
                        item_title: 'Title 1',
                        band_name: 'Artist 1',
                        item_url: 'http://url1',
                        item_art_url: 'http://cover1',
                        also_collected_count: 5
                    },
                    {
                        tralbum_id: 2,
                        tralbum_type: 't',
                        album_title: 'Title 2',
                        item_art: { thumb_url: 'http://cover2' }
                    }
                ],
                tracklists: {
                    t2: [
                        { file: { 'mp3-128': 'http://preview2' } }
                    ]
                },
                more_available: false
            })
        } as Response);

        const result = await getFanCollection(123);
        expect(result).toEqual([
            {
                tralbumId: 1,
                tralbumType: 'a',
                title: 'Title 1',
                artist: 'Artist 1',
                url: 'http://url1',
                coverUrl: 'http://cover1',
                alsoCollectedCount: 5,
                previewUrl: null
            },
            {
                tralbumId: 2,
                tralbumType: 't',
                title: 'Title 2',
                artist: 'Unknown',
                url: '',
                coverUrl: 'http://cover2',
                alsoCollectedCount: 0,
                previewUrl: 'http://preview2'
            }
        ]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});

describe('getFanCollection - Extra Tests', () => {
    let mockFetch: ReturnType<typeof jest.spyOn>;
    let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        mockFetch = jest.spyOn(global, 'fetch');
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('paginates correctly using tokens', async () => {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        { tralbum_id: 1, tralbum_type: 'a' },
                        { tralbum_id: 2, tralbum_type: 'a' }
                    ],
                    last_token: 'token1',
                    more_available: true
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        { tralbum_id: 3, tralbum_type: 'a' }
                    ],
                    last_token: 'token2',
                    more_available: false
                })
            } as Response);

        const result = await getFanCollection(123);
        expect(result).toHaveLength(3);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Check if token was passed correctly in second call
        const secondCallArg = mockFetch.mock.calls[1][1];
        const body = JSON.parse((secondCallArg as RequestInit).body as string);
        expect(body.older_than_token).toBe('token1');
    });

    it('stops at limit and slices results', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: [
                    { tralbum_id: 1, tralbum_type: 'a' },
                    { tralbum_id: 2, tralbum_type: 'a' },
                    { tralbum_id: 3, tralbum_type: 'a' }
                ],
                more_available: false
            })
        } as Response);

        const result = await getFanCollection(123, 2);
        expect(result).toHaveLength(2);
        expect(result[0].tralbumId).toBe(1);
        expect(result[1].tralbumId).toBe(2);
    });

    it('handles empty results array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: []
            })
        } as Response);
        const result = await getFanCollection(123);
        expect(result).toEqual([]);
    });

    it('skips items without tralbum_id', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: [
                    { tralbum_type: 'a' }, // missing id
                    { tralbum_id: 1, tralbum_type: 'a' }
                ],
                more_available: false
            })
        } as Response);

        const result = await getFanCollection(123);
        expect(result).toHaveLength(1);
        expect(result[0].tralbumId).toBe(1);
    });
});
