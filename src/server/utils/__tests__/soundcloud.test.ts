import { jest } from '@jest/globals';
import { SoundCloudClient, getClientId, clearSoundCloudClientId, scApiRequest, resolveArtworkUrl } from '../soundcloud';

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

  it('should throw an error when fetch rejects (network error)', async () => {
    const mockUrl = 'https://soundcloud.com/artist/track';
    const networkError = new Error('Network failure');

    (global.fetch as jest.Mock).mockRejectedValueOnce(networkError);

    await expect(client.resolveUrl(mockUrl)).rejects.toThrow('Network failure');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(mockUrl)}&client_id=${mockClientId}`
    );
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

describe('getClientId and clearSoundCloudClientId', () => {
  beforeEach(() => {
    clearSoundCloudClientId();
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should scrape client ID from SoundCloud homepage and JS bundles', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script><script src="https://a-v2.sndcdn.com/assets/3-4.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'some JS without client id',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"my_sc_client_id"};',
      });

    const clientId = await getClientId();
    expect(clientId).toBe('my_sc_client_id');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should return cached client ID if available and forceRefresh is false', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"cached_client_id"};',
      });

    const id1 = await getClientId();
    expect(id1).toBe('cached_client_id');

    // Should not call fetch again
    const id2 = await getClientId();
    expect(id2).toBe('cached_client_id');
    expect(global.fetch).toHaveBeenCalledTimes(2); // 1 for home, 1 for script
  });

  it('should force refresh when forceRefresh is true', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"cached_client_id"};',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/3-4.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"new_client_id"};',
      });

    const id1 = await getClientId();
    expect(id1).toBe('cached_client_id');

    const id2 = await getClientId(true);
    expect(id2).toBe('new_client_id');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('should throw an error if SoundCloud homepage fetch rejects (network error)', async () => {
    const networkError = new Error('Network timeout');
    (global.fetch as jest.Mock).mockRejectedValueOnce(networkError);

    await expect(getClientId()).rejects.toThrow('Network timeout');
  });

  it('should throw an error if SoundCloud homepage fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(getClientId()).rejects.toThrow('SoundCloud homepage fetch failed: 500');
  });

  it('should throw an error if no sndcdn scripts are found', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No scripts here</body></html>',
    });

    await expect(getClientId()).rejects.toThrow('No sndcdn script URLs found on SoundCloud homepage');
  });

  it('should continue if a script fetch fails or returns not ok', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script><script src="https://a-v2.sndcdn.com/assets/3-4.js"></script></html>',
      })
      // reverse order fetch, so 3-4.js is fetched first and fails
      .mockResolvedValueOnce({
        ok: false,
      })
      // 1-2.js fetched next and succeeds
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"my_sc_client_id2"};',
      });

    const clientId = await getClientId();
    expect(clientId).toBe('my_sc_client_id2');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should throw an error if client_id cannot be extracted from scripts', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={}; // missing client_id',
      });

    await expect(getClientId()).rejects.toThrow('Could not extract client_id from SoundCloud JS bundles');
  });

  it('should clear cached client ID', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValue({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      });
      // We will override this below

    // fetch #1: home, fetch #2: script
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"cached_client_id"};',
      })
      // fetch #3: home, fetch #4: script
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"cached_client_id"};',
      });

    await getClientId();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    clearSoundCloudClientId();

    // Since it was cleared, it should fetch again
    await getClientId();
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

describe('scApiRequest', () => {
  beforeEach(() => {
    clearSoundCloudClientId();
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should make a successful request to the SoundCloud API', async () => {
    const mockResponse = { id: 456, title: 'API Track' };
    (global.fetch as jest.Mock)
      // fetch #1: home
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      // fetch #2: script
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"my_client_id"};',
      })
      // fetch #3: API request
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await scApiRequest('users/123/tracks', { limit: '10' });

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenNthCalledWith(3, 'https://api-v2.soundcloud.com/users/123/tracks?limit=10&client_id=my_client_id', expect.any(Object));
  });

  it('should throw an error if the API request rejects (network error)', async () => {
    const networkError = new Error('API down');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"my_client_id"};',
      })
      .mockRejectedValueOnce(networkError);

    await expect(scApiRequest('invalid-endpoint')).rejects.toThrow('API down');
  });

  it('should throw an error if the API request fails with non 401/403 status', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"my_client_id"};',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    await expect(scApiRequest('invalid-endpoint')).rejects.toThrow('SoundCloud API error: 404 for invalid-endpoint');
  });

  it('should refresh client ID and retry if API request fails with 401', async () => {
    const mockResponse = { data: 'success after retry' };
    (global.fetch as jest.Mock)
      // fetch #1 & #2: getClientId() initially
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"expired_id"};',
      })
      // fetch #3: Initial API request (fails with 401)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      // fetch #4 & #5: getClientId(true) forced refresh
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"new_id"};',
      })
      // fetch #6: Retried API request (succeeds)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await scApiRequest('some-endpoint');

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(6);
    expect(global.fetch).toHaveBeenNthCalledWith(3, 'https://api-v2.soundcloud.com/some-endpoint?client_id=expired_id', expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(6, 'https://api-v2.soundcloud.com/some-endpoint?client_id=new_id', expect.any(Object));
  });

  it('should refresh client ID and retry if API request fails with 403', async () => {
    const mockResponse = { data: 'success after retry' };
    (global.fetch as jest.Mock)
      // fetch #1 & #2: getClientId() initially
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"expired_id"};',
      })
      // fetch #3: Initial API request (fails with 403)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
      })
      // fetch #4 & #5: getClientId(true) forced refresh
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"new_id"};',
      })
      // fetch #6: Retried API request (succeeds)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await scApiRequest('some-endpoint');

    expect(result).toEqual(mockResponse);
  });

  it('should throw an error if the retried API request fails', async () => {
    (global.fetch as jest.Mock)
      // fetch #1 & #2: getClientId() initially
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"expired_id"};',
      })
      // fetch #3: Initial API request (fails with 401)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      // fetch #4 & #5: getClientId(true) forced refresh
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><script src="https://a-v2.sndcdn.com/assets/1-2.js"></script></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'var config={client_id:"new_id"};',
      })
      // fetch #6: Retried API request (fails)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    await expect(scApiRequest('some-endpoint')).rejects.toThrow('SoundCloud API error: 500 for some-endpoint');
  });
});

describe('resolveArtworkUrl', () => {
  it('should return undefined if no artwork or avatar url is present', () => {
    const track = { title: 'Track without artwork' };
    expect(resolveArtworkUrl(track)).toBeUndefined();
  });

  it('should use artwork_url and replace -large. with -t500x500.', () => {
    const track = { artwork_url: 'https://i1.sndcdn.com/artworks-000-large.jpg' };
    expect(resolveArtworkUrl(track)).toBe('https://i1.sndcdn.com/artworks-000-t500x500.jpg');
  });

  it('should fallback to avatar_url if artwork_url is missing', () => {
    const track = { avatar_url: 'https://i1.sndcdn.com/avatars-000-large.jpg' };
    expect(resolveArtworkUrl(track)).toBe('https://i1.sndcdn.com/avatars-000-t500x500.jpg');
  });

  it('should not throw if the URL does not contain -large.', () => {
    const track = { artwork_url: 'https://i1.sndcdn.com/artworks-000-t500x500.jpg' };
    expect(resolveArtworkUrl(track)).toBe('https://i1.sndcdn.com/artworks-000-t500x500.jpg');
  });
});
