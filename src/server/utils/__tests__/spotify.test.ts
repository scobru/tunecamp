import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { isSpotifyPlaylistUrl, extractSpotifyPlaylistId, SpotifyMetadataClient } from '../spotify.js';

describe('Spotify Utilities', () => {
    let mockFetch: any;

    beforeEach(() => {
        mockFetch = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        mockFetch.mockRestore();
    });

    describe('isSpotifyPlaylistUrl', () => {
        it('should return true for valid spotify playlist URIs', () => {
            expect(isSpotifyPlaylistUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
        });

        it('should return true for valid open.spotify.com URLs', () => {
            expect(isSpotifyPlaylistUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
            expect(isSpotifyPlaylistUrl('http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123')).toBe(true);
        });

        it('should return false for invalid spotify URLs', () => {
            expect(isSpotifyPlaylistUrl('https://open.spotify.com/track/37i9dQZF1DXcBWIGoYBM5M')).toBe(false);
            expect(isSpotifyPlaylistUrl('https://google.com/playlist/123')).toBe(false);
        });

        it('should return false for invalid strings', () => {
            expect(isSpotifyPlaylistUrl('not-a-url')).toBe(false);
            expect(isSpotifyPlaylistUrl('')).toBe(false);
        });
    });

    describe('extractSpotifyPlaylistId', () => {
        it('should extract ID from spotify URI', () => {
            expect(extractSpotifyPlaylistId('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe('37i9dQZF1DXcBWIGoYBM5M');
        });

        it('should extract ID from open.spotify.com URL', () => {
            expect(extractSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe('37i9dQZF1DXcBWIGoYBM5M');
            expect(extractSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123')).toBe('37i9dQZF1DXcBWIGoYBM5M');
        });

        it('should throw or behave properly on invalid URLs (when assumed valid prior)', () => {
            // Given the implementation expects valid URLs, it doesn't try/catch extractSpotifyPlaylistId
            expect(() => extractSpotifyPlaylistId('not-a-url')).toThrow();
        });
    });

    describe('SpotifyMetadataClient', () => {
        let client: SpotifyMetadataClient;

        beforeEach(() => {
            client = new SpotifyMetadataClient();
        });

                describe('searchTracks', () => {
            it('should fetch and map tracks correctly', async () => {
                mockFetch.mockImplementation(async (url: string | URL, options?: RequestInit) => {
                    const urlString = url.toString();
                    if (urlString === 'https://open.spotify.com/api/server-time') {
                        return { ok: true, json: async () => ({ serverTime: 1234567890 }) };
                    }
                    if (urlString.startsWith('https://open.spotify.com/api/token')) {
                        return {
                            ok: true,
                            json: async () => ({
                                accessToken: 'mock-token',
                                accessTokenExpirationTimestampMs: Date.now() + 3600000
                            })
                        };
                    }
                    if (urlString === 'https://api-partner.spotify.com/pathfinder/v2/query') {
                        const body = JSON.parse(options?.body as string);
                        if (body.operationName === 'searchTracks') {
                            return {
                                ok: true,
                                json: async () => ({
                                    data: {
                                        searchV2: {
                                            tracksV2: {
                                                items: [
                                                    { item: { data: { id: 'track1', name: 'Song 1' } } },
                                                    { item: { data: { id: 'track2', name: 'Song 2' } } }
                                                ]
                                            }
                                        }
                                    }
                                })
                            };
                        }
                    }
                    return { ok: false, status: 404 };
                });

                const results = await client.searchTracks('test query', 2);
                expect(results).toEqual([
                    { id: 'track1', name: 'Song 1' },
                    { id: 'track2', name: 'Song 2' }
                ]);
            });

            it('should throw error on API failure', async () => {
                mockFetch.mockImplementation(async (url: string | URL, options?: RequestInit) => {
                    const urlString = url.toString();
                    if (urlString === 'https://open.spotify.com/api/server-time') {
                        return { ok: true, json: async () => ({ serverTime: 1234567890 }) };
                    }
                    if (urlString.startsWith('https://open.spotify.com/api/token')) {
                        return {
                            ok: true,
                            json: async () => ({
                                accessToken: 'mock-token',
                                accessTokenExpirationTimestampMs: Date.now() + 3600000
                            })
                        };
                    }
                    if (urlString === 'https://api-partner.spotify.com/pathfinder/v2/query') {
                        return { ok: false, status: 500 };
                    }
                    return { ok: false, status: 404 };
                });

                await expect(client.searchTracks('test query')).rejects.toThrow('Spotify Pathfinder API error: 500');
            });
        });
        describe('getPlaylist', () => {
            it('should fetch playlist using fetchPlaylist', async () => {
                mockFetch.mockImplementation(async (url: string | URL, options?: RequestInit) => {
                    const urlString = url.toString();
                    if (urlString === 'https://open.spotify.com/api/server-time') {
                        return { ok: true, json: async () => ({ serverTime: 1234567890 }) };
                    }
                    if (urlString.startsWith('https://open.spotify.com/api/token')) {
                        return {
                            ok: true,
                            json: async () => ({
                                accessToken: 'mock-token',
                                accessTokenExpirationTimestampMs: Date.now() + 3600000
                            })
                        };
                    }
                    if (urlString === 'https://api-partner.spotify.com/pathfinder/v2/query') {
                        const body = JSON.parse(options?.body as string);
                        if (body.operationName === 'fetchPlaylist') {
                            return {
                                ok: true,
                                json: async () => ({
                                    data: {
                                        playlistV2: { id: 'playlist1', name: 'My Playlist' }
                                    }
                                })
                            };
                        }
                    }
                    return { ok: false, status: 404 };
                });

                const result = await client.getPlaylist('playlist1');
                expect(result).toEqual({ id: 'playlist1', name: 'My Playlist' });
            });

            it('should fallback to fetchPlaylistContents if fetchPlaylist fails', async () => {
                const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

                mockFetch.mockImplementation(async (url: string | URL, options?: RequestInit) => {
                    const urlString = url.toString();
                    if (urlString === 'https://open.spotify.com/api/server-time') {
                        return { ok: true, json: async () => ({ serverTime: 1234567890 }) };
                    }
                    if (urlString.startsWith('https://open.spotify.com/api/token')) {
                        return {
                            ok: true,
                            json: async () => ({
                                accessToken: 'mock-token',
                                accessTokenExpirationTimestampMs: Date.now() + 3600000
                            })
                        };
                    }
                    if (urlString === 'https://api-partner.spotify.com/pathfinder/v2/query') {
                        const body = JSON.parse(options?.body as string);
                        if (body.operationName === 'fetchPlaylist') {
                            return { ok: false, status: 500 }; // Fail primary
                        }
                        if (body.operationName === 'fetchPlaylistContents') {
                            return {
                                ok: true,
                                json: async () => ({
                                    data: {
                                        playlistV2: { id: 'playlist1', name: 'My Playlist Contents' }
                                    }
                                })
                            };
                        }
                    }
                    return { ok: false, status: 404 };
                });

                const result = await client.getPlaylist('playlist1');
                expect(result).toEqual({ id: 'playlist1', name: 'My Playlist Contents' });
                expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('[Spotify] fetchPlaylist failed for playlist1, trying contents fallback...'));

                mockConsoleWarn.mockRestore();
            });

            it('should throw error if both fetches fail', async () => {
                const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

                mockFetch.mockImplementation(async (url: string | URL, options?: RequestInit) => {
                    const urlString = url.toString();
                    if (urlString === 'https://open.spotify.com/api/server-time') {
                        return { ok: true, json: async () => ({ serverTime: 1234567890 }) };
                    }
                    if (urlString.startsWith('https://open.spotify.com/api/token')) {
                        return {
                            ok: true,
                            json: async () => ({
                                accessToken: 'mock-token',
                                accessTokenExpirationTimestampMs: Date.now() + 3600000
                            })
                        };
                    }
                    if (urlString === 'https://api-partner.spotify.com/pathfinder/v2/query') {
                        return { ok: false, status: 500 }; // Fail both
                    }
                    return { ok: false, status: 404 };
                });

                await expect(client.getPlaylist('playlist1')).rejects.toThrow('Spotify Pathfinder API error: 500');
                expect(mockConsoleWarn).toHaveBeenCalled();

                mockConsoleWarn.mockRestore();
            });
        });
    });
});
