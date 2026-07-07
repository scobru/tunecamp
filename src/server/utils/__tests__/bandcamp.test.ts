import { jest } from '@jest/globals';
import { extractBandcampMetadata } from '../bandcamp.js';

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
