import { jest } from '@jest/globals';
import { getTralbumCollectors, getFanCollection, extractBandcampMetadata, searchBandcamp, BANDCAMP_IMAGE_BASE } from '../bandcamp.js';

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

describe('extractBandcampMetadata', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: jest.Mock;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockFetch = jest.fn() as any;
    global.fetch = mockFetch as any;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepends https:// to url if not starting with http', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await extractBandcampMetadata('test.bandcamp.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.bandcamp.com',
      expect.any(Object)
    );
  });

  it('returns null if response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch https://test.bandcamp.com: 404'));
  });

  it('returns null if fetch throws an error', async () => {
    const error = new Error('Network error');
    mockFetch.mockRejectedValueOnce(error);

    const result = await extractBandcampMetadata('https://test.bandcamp.com');
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error extracting metadata'), error);
  });

  it('returns null if data-tralbum script is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No data here</body></html>',
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No data-tralbum found'));
  });

  it('extracts metadata correctly when data-tralbum is present', async () => {
    const mockTralbumData = {
      artist: 'Test Artist',
      current: {
        title: 'Test Album',
        release_date: '2023-01-01'
      },
      art_id: 12345,
      id: 98765,
      item_type: 'album',
      tags: [{ name: 'electronic' }],
      trackinfo: [
        {
          title: 'Test Track 1',
          duration: 180,
          track_num: 1,
          lyrics: 'la la la',
          file: { 'mp3-128': 'https://stream.url' },
          title_link: '/track/test-track-1'
        },
        {
          name: 'Test Track 2',
          duration: 200,
          position: 2,
          // no file
        }
      ]
    };

    const html = `
      <html>
        <body>
          <script data-tralbum="${JSON.stringify(mockTralbumData).replace(/"/g, '&quot;')}"></script>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');

    expect(result).not.toBeNull();
    expect(result).toEqual({
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2023,
      cover: 'https://f4.bcbits.com/img/a12345_10.jpg',
      genre: 'electronic',
      tralbumId: 98765,
      tralbumType: 'a',
      tracks: [
        {
          title: 'Test Track 1',
          duration: 180,
          position: 1,
          lyrics: 'la la la',
          streamUrl: 'https://stream.url',
          url: 'https://test.bandcamp.com/track/test-track-1'
        },
        {
          title: 'Test Track 2',
          duration: 200,
          position: 2,
          lyrics: null,
          streamUrl: null,
          url: undefined
        }
      ]
    });
  });

  it('handles missing current date by falling back to current year', async () => {
    const currentYear = new Date().getFullYear();
    const mockTralbumData = {
      artist: 'Test Artist',
      current: {
        title: 'Test Album'
      },
      trackinfo: []
    };

    const html = `
      <html>
        <body>
          <script data-tralbum="${JSON.stringify(mockTralbumData).replace(/"/g, '&quot;')}"></script>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');

    expect(result).not.toBeNull();
    expect(result?.year).toBe(currentYear);
  });

  it('handles missing current title by falling back to first track title', async () => {
    const mockTralbumData = {
      artist: 'Test Artist',
      current: {},
      trackinfo: [
        { title: 'Track 1 Title' }
      ]
    };

    const html = `
      <html>
        <body>
          <script data-tralbum="${JSON.stringify(mockTralbumData).replace(/"/g, '&quot;')}"></script>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Track 1 Title');
  });

  it('handles item_type track by mapping to tralbumType t', async () => {
    const mockTralbumData = {
      item_type: 'track',
      trackinfo: []
    };

    const html = `
      <html>
        <body>
          <script data-tralbum="${JSON.stringify(mockTralbumData).replace(/"/g, '&quot;')}"></script>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');

    expect(result).not.toBeNull();
    expect(result?.tralbumType).toBe('t');
  });

  it('filters out tracks without a title', async () => {
    const mockTralbumData = {
      trackinfo: [
        { title: 'Valid Track' },
        { duration: 120 } // Missing title
      ]
    };

    const html = `
      <html>
        <body>
          <script data-tralbum="${JSON.stringify(mockTralbumData).replace(/"/g, '&quot;')}"></script>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });

    const result = await extractBandcampMetadata('https://test.bandcamp.com');

    expect(result?.tracks).toHaveLength(1);
    expect(result?.tracks[0].title).toBe('Valid Track');
  });
});

describe('searchBandcamp', () => {
    let mockFetch: any;
    let mockConsoleError: any;

    beforeEach(() => {
        mockFetch = jest.spyOn(global, 'fetch');
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

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

describe('BANDCAMP_IMAGE_BASE', () => {
    it('should have the correct base URL', () => {
        expect(BANDCAMP_IMAGE_BASE).toBe('https://f4.bcbits.com/img');
    });
});
