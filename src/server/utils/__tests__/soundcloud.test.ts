import { jest } from '@jest/globals';
import { SoundCloudClient } from '../soundcloud';

describe('SoundCloudClient', () => {
  let client: SoundCloudClient;
  const mockClientId = 'mock-client-id';

  beforeEach(() => {
    client = new SoundCloudClient(mockClientId);
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully resolve a URL', async () => {
    const mockUrl = 'https://soundcloud.com/artist/track';
    const mockResponse = { id: 123, title: 'Mock Track' };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.resolveUrl(mockUrl);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(mockUrl)}&client_id=${mockClientId}`
    );
    expect(result).toEqual(mockResponse);
  });

  it('should throw an error when the API request fails', async () => {
    const mockUrl = 'https://soundcloud.com/artist/track';

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(client.resolveUrl(mockUrl)).rejects.toThrow('SoundCloud API error: 404');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(mockUrl)}&client_id=${mockClientId}`
    );
  });
});
