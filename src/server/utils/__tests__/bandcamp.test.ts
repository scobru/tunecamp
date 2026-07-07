import { jest } from '@jest/globals';
import { searchBandcamp } from '../bandcamp.js';

describe('Bandcamp Utils', () => {
    let mockFetch: any;
    let mockConsoleError: any;

    beforeEach(() => {
        mockFetch = jest.spyOn(global, 'fetch');
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('searchBandcamp', () => {
        it('should map search results correctly and respect the limit', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    auto: {
                        results: [
                            { type: 'b', id: 1, name: 'Band 1', item_url_path: '/band1', img: 'img1', art_id: 101, genre_name: 'Rock', band_name: 'Band 1', location: 'Earth' },
                            { type: 'b', id: 2, name: 'Band 2', item_url_root: '/band2', img: 'img2', art_id: 102, genre_name: 'Pop', band_name: 'Band 2', location: 'Mars' },
                            { type: 'b', id: 3, name: 'Band 3', item_url_path: '/band3', img: 'img3', art_id: 103, genre_name: 'Jazz', band_name: 'Band 3', location: 'Venus' }
                        ]
                    }
                })
            });

            const results = await searchBandcamp('test', 'b', 2);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        search_text: 'test',
                        search_filter: 'b',
                        full_page: false,
                        fan_id: null,
                    })
                })
            );
            expect(results).toHaveLength(2);
            expect(results[0]).toEqual({
                type: 'b', id: 1, name: 'Band 1', url: '/band1', img: 'img1', art_id: 101, genre_name: 'Rock', band_name: 'Band 1', album_name: undefined, location: 'Earth'
            });
            expect(results[1]).toEqual({
                type: 'b', id: 2, name: 'Band 2', url: '/band2', img: 'img2', art_id: 102, genre_name: 'Pop', band_name: 'Band 2', album_name: undefined, location: 'Mars'
            });
        });

        it('should return an empty array and log error when API responds with non-ok status', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const results = await searchBandcamp('error query');
            expect(results).toEqual([]);
            expect(mockConsoleError).toHaveBeenCalledWith(
                '[Bandcamp] Search failed for "error query":',
                expect.any(Error)
            );
        });

        it('should return an empty array and log error when fetch throws an exception', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const results = await searchBandcamp('network error query');
            expect(results).toEqual([]);
            expect(mockConsoleError).toHaveBeenCalledWith(
                '[Bandcamp] Search failed for "network error query":',
                expect.any(Error)
            );
        });

        it('should handle missing results array gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    auto: {} // no results array
                })
            });

            const results = await searchBandcamp('empty auto query');
            expect(results).toEqual([]);
        });
    });
});
