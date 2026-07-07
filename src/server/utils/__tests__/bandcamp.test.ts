import { jest } from '@jest/globals';
import { getFanCollection } from '../bandcamp';

describe('getFanCollection', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as any;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully fetch and map a fan collection', async () => {
    const mockResponse = {
      items: [
        {
          tralbum_id: 123,
          tralbum_type: 'a',
          item_title: 'Album Title',
          band_name: 'Artist Name',
          item_url: 'https://example.com/album',
          item_art_url: 'https://example.com/art.jpg',
          also_collected_count: 5
        },
        {
          tralbum_id: 456,
          tralbum_type: 't',
          item_title: 'Track Title',
          band_name: 'Track Artist',
          item_url: 'https://example.com/track',
          item_art_url: 'https://example.com/art2.jpg',
          also_collected_count: 10
        }
      ],
      tracklists: {
        a123: [
          {
            file: {
              'mp3-128': 'https://example.com/stream1.mp3'
            }
          }
        ],
        t456: [
          {
            file: {
              'mp3-128': 'https://example.com/stream2.mp3'
            }
          }
        ]
      },
      more_available: false,
      last_token: 'token123'
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const items = await getFanCollection(999, 10);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      tralbumId: 123,
      tralbumType: 'a',
      title: 'Album Title',
      artist: 'Artist Name',
      url: 'https://example.com/album',
      coverUrl: 'https://example.com/art.jpg',
      alsoCollectedCount: 5,
      previewUrl: 'https://example.com/stream1.mp3'
    });
    expect(items[1]).toEqual({
      tralbumId: 456,
      tralbumType: 't',
      title: 'Track Title',
      artist: 'Track Artist',
      url: 'https://example.com/track',
      coverUrl: 'https://example.com/art2.jpg',
      alsoCollectedCount: 10,
      previewUrl: 'https://example.com/stream2.mp3'
    });
  });

  it('should handle pagination if limit is larger than page size', async () => {
    const page1 = {
      items: Array.from({ length: 40 }, (_, i) => ({
        tralbum_id: i,
        tralbum_type: 'a',
        item_title: `Title ${i}`,
      })),
      more_available: true,
      last_token: 'token-page-1'
    };

    const page2 = {
      items: [
        {
          tralbum_id: 40,
          tralbum_type: 'a',
          item_title: `Title 40`,
        }
      ],
      more_available: false,
      last_token: 'token-page-2'
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => page1,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => page2,
      });

    const items = await getFanCollection(999, 45);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(41);
    expect(items[40].title).toBe('Title 40');
  });

  it('should skip items without tralbum_id', async () => {
    const mockResponse = {
      items: [
        {
          item_title: 'No ID',
        },
        {
          tralbum_id: 1,
          tralbum_type: 'a',
          item_title: 'With ID',
        }
      ],
      more_available: false
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const items = await getFanCollection(999, 10);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('With ID');
  });

  it('should handle fetch errors gracefully and return collected items so far', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const items = await getFanCollection(999, 10);

    expect(items).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('should stop fetching if items length reaches limit', async () => {
    const page1 = {
      items: Array.from({ length: 40 }, (_, i) => ({
        tralbum_id: i,
        tralbum_type: 'a',
        item_title: `Title ${i}`,
      })),
      more_available: true,
      last_token: 'token-page-1'
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => page1,
    });

    const items = await getFanCollection(999, 20);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(20);
  });
});
