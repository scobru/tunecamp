import { jest } from '@jest/globals';
import { ActivityPubService } from '../activitypub.service.js';
import type { FederationProvider } from '../federation.provider.js';
import type { ServerConfig } from '../../../core/config.js';
import type { Federation } from '@fedify/fedify';

describe('ActivityPubService', () => {
  let service: ActivityPubService;
  let mockDb: jest.Mocked<FederationProvider>;
  let mockConfig: ServerConfig;
  let mockFederation: Federation<void>;
  let mockTransport: any;
  let mockDeliveryQueue: any;

  beforeEach(() => {
    mockDb = {
      getSetting: jest.fn().mockImplementation((key) => {
          if (key === 'publicUrl') return 'https://test.com';
          return null;
      }),
      getArtistBySlug: jest.fn().mockReturnValue({ id: 1, slug: 'test-artist', name: 'Test' } as any),
      getArtist: jest.fn().mockReturnValue({ id: 1, slug: 'test-artist', name: 'Test' } as any),
      ensureArtistKeys: jest.fn().mockResolvedValue(undefined as never),
      ensureUserKeys: jest.fn().mockResolvedValue(undefined as never),
      upsertRemoteActor: jest.fn(),
      addFollower: jest.fn(),
      updateArtistFollowingCount: jest.fn(),
      addFollowing: jest.fn(),
      acceptFollower: jest.fn(),
      acceptPendingFollowers: jest.fn(),
      unfollowActor: jest.fn(),
      removeFollowing: jest.fn(),
      isArtistLinkedToUser: jest.fn().mockReturnValue(true),
      updateArtistKeys: jest.fn(),
      setSetting: jest.fn(),
      getUser: jest.fn(),
      updateUserApKeys: jest.fn(),
      getTrack: jest.fn(),
      getAlbum: jest.fn(),
      getFollowers: jest.fn().mockReturnValue([]),
      getUserByUsername: jest.fn(),
      getFollower: jest.fn(),
      rejectFollower: jest.fn(),
      removeFollower: jest.fn(),
    } as any;

    mockConfig = {
      domain: 'test.com',
      publicUrl: 'https://test.com',
      port: 3000,
    } as any;

    mockFederation = {} as any;

    service = new ActivityPubService(mockDb, mockConfig, mockFederation);

    mockTransport = {
      fetchWithSignature: jest.fn(),
      send: jest.fn()
    };
    mockDeliveryQueue = {
      enqueue: jest.fn(),
      start: jest.fn()
    };

    (service as any).transport = mockTransport;
    (service as any).deliveryQueue = mockDeliveryQueue;

    // Mock getInboxFromActor directly to bypass internal network logic for tests
    jest.spyOn(service as any, 'getInboxFromActor').mockImplementation(async (uri: string) => {
      if (uri === 'https://remote.test/actor') return 'https://remote.test/inbox';
      return null;
    });

    // Mock fetchRemoteOutbox to avoid the undefined fetchWithSignature errors
    jest.spyOn(service as any, 'fetchRemoteOutbox').mockResolvedValue(undefined);

    // WebFinger resolution
    global.fetch = jest.fn() as any;
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        links: [
          { rel: 'self', href: 'https://remote.test/actor' }
        ]
      })
    });
  });

  describe('followRemoteActor', () => {
    it('should follow a remote actor successfully', async () => {
      mockTransport.send.mockResolvedValueOnce(true);

      const result = await service.followRemoteActor('https://remote.test/actor', 'test-artist');

      expect(result).toBeUndefined(); // followRemoteActor returns void/undefined
      expect(mockTransport.send).toHaveBeenCalledTimes(1);

      const [actor, inbox, activity] = mockTransport.send.mock.calls[0];
      expect(actor).toMatchObject({ id: 1, slug: 'test-artist' });
      expect(inbox).toBe('https://remote.test/inbox');
      expect(activity).toBeDefined();

      expect(mockDb.addFollowing).toHaveBeenCalledWith(1, 'https://remote.test/actor', 'https://remote.test/inbox');
    });

    it('should throw an error if inbox cannot be resolved', async () => {
      jest.spyOn(service as any, 'getInboxFromActor').mockResolvedValueOnce(null);

      await expect(service.followRemoteActor('https://remote.test/actor', 'test-artist'))
        .rejects
        .toThrow(/Could not resolve an ActivityPub actor/);
    });
  });

  describe('sendActivity', () => {
    it('should use delivery queue if immediate send fails', async () => {
      const actor = { id: 1, slug: 'artist' };
      const inboxUri = 'https://remote.test/inbox';
      const activityJson = { type: 'Create' };

      mockTransport.send.mockResolvedValueOnce(false);

      await service.sendActivity(actor as any, inboxUri, activityJson);

      expect(mockTransport.send).toHaveBeenCalledWith(actor, inboxUri, activityJson);
      expect(mockDeliveryQueue.enqueue).toHaveBeenCalledWith('artist', inboxUri, activityJson);
    });

    it('should not enqueue if immediate send succeeds', async () => {
      const actor = { id: 1, slug: 'artist' };
      const inboxUri = 'https://remote.test/inbox';
      const activityJson = { type: 'Create' };

      mockTransport.send.mockResolvedValueOnce(true);

      await service.sendActivity(actor as any, inboxUri, activityJson);

      expect(mockTransport.send).toHaveBeenCalledWith(actor, inboxUri, activityJson);
      expect(mockDeliveryQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('acceptFollowRequest', () => {
    it('should accept a pending follow request and send an Accept activity', async () => {
      const actor = { id: 1, slug: 'test-artist', name: 'Test Artist' };
      const actorUri = 'https://remote.test/actor';
      mockDb.getFollower = jest.fn().mockReturnValue({ follow_id: 'https://remote.test/follow-1' } as any);

      mockTransport.send.mockResolvedValueOnce(true);

      await service.acceptFollowRequest(actor as any, actorUri);

      expect(mockDb.acceptFollower).toHaveBeenCalledWith(1, actorUri);
      expect(mockTransport.send).toHaveBeenCalledTimes(1);

      const [sendActor, sendInbox, sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendActor).toEqual(actor);
      expect(sendInbox).toBe('https://remote.test/inbox');
      expect(sendActivity.type).toBe('Accept');
      expect(sendActivity.object.id).toBe('https://remote.test/follow-1');
    });

    it('should fail silently and log an error if inbox cannot be found', async () => {
      const actor = { id: 1, slug: 'test-artist', name: 'Test Artist' };
      const actorUri = 'https://remote.test/actor-no-inbox';
      jest.spyOn(service as any, 'getInboxFromActor').mockResolvedValueOnce(null);

      await service.acceptFollowRequest(actor as any, actorUri);

      expect(mockDb.acceptFollower).not.toHaveBeenCalled();
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe('unfollowRemoteActor', () => {
    it('should unfollow a remote actor and send Undo Follow activity', async () => {
      mockTransport.send.mockResolvedValueOnce(true);

      await service.unfollowRemoteActor('https://remote.test/actor', 'test-artist');

      expect(mockDb.unfollowActor).toHaveBeenCalledWith('https://remote.test/actor');
      expect(mockTransport.send).toHaveBeenCalledTimes(1);

      const [sendActor, sendInbox, sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendActor.slug).toBe('test-artist');
      expect(sendInbox).toBe('https://remote.test/inbox');
      expect(sendActivity.type).toBe('Undo');
      expect(sendActivity.object.type).toBe('Follow');
      expect(sendActivity.object.object).toBe('https://remote.test/actor');
    });
  });

  describe('getDomain / getBaseUrl', () => {
    it('derives domain from publicUrl setting', () => {
      expect(service.getBaseUrl()).toBe('https://test.com');
      expect(service.getDomain()).toBe('test.com');
    });

    it('falls back to config port when no publicUrl configured', () => {
      mockDb.getSetting = jest.fn().mockReturnValue(null);
      mockConfig.publicUrl = undefined;
      const svc = new ActivityPubService(mockDb, mockConfig, mockFederation);
      expect(svc.getBaseUrl()).toBe('http://localhost:3000');
      expect(svc.getDomain()).toBe('localhost');
    });

    it('strips trailing slash from publicUrl', () => {
      mockDb.getSetting = jest.fn().mockImplementation((key) => key === 'publicUrl' ? 'https://test.com/' : null);
      const svc = new ActivityPubService(mockDb, mockConfig, mockFederation);
      expect(svc.getBaseUrl()).toBe('https://test.com');
    });
  });

  describe('ensureArtistKeys', () => {
    it('does nothing if artist not found', async () => {
      mockDb.getArtist = jest.fn().mockReturnValue(undefined as any);
      await service.ensureArtistKeys(99);
      expect(mockDb.updateArtistKeys).not.toHaveBeenCalled();
    });

    it('skips key generation when artist has no linked user account', async () => {
      mockDb.isArtistLinkedToUser = jest.fn().mockReturnValue(false);
      await service.ensureArtistKeys(1);
      expect(mockDb.updateArtistKeys).not.toHaveBeenCalled();
    });

    it('skips key generation when artist already has keys', async () => {
      mockDb.getArtist = jest.fn().mockReturnValue({ id: 1, slug: 'a', name: 'A', public_key: 'pub', private_key: 'priv' } as any);
      await service.ensureArtistKeys(1);
      expect(mockDb.updateArtistKeys).not.toHaveBeenCalled();
    });

    it('generates and persists keys when linked artist lacks them', async () => {
      mockDb.getArtist = jest.fn().mockReturnValue({ id: 1, slug: 'a', name: 'A' } as any);
      await service.ensureArtistKeys(1);
      expect(mockDb.updateArtistKeys).toHaveBeenCalledTimes(1);
      const [artistId, publicKey, privateKey] = (mockDb.updateArtistKeys as jest.Mock).mock.calls[0];
      expect(artistId).toBe(1);
      expect(typeof publicKey).toBe('string');
      expect(typeof privateKey).toBe('string');
    }, 15000);
  });

  describe('generateWebFinger', () => {
    it('returns null when resource does not match an artist or the site handle', () => {
      mockDb.getArtistBySlug = jest.fn().mockReturnValue(undefined as any);
      expect(service.generateWebFinger('acct:nobody@test.com')).toBeNull();
    });

    it('renders webfinger for a known artist', () => {
      const result = service.generateWebFinger('acct:test-artist@test.com');
      expect(result).toBeTruthy();
      expect(result.subject).toBe('acct:test-artist@test.com');
    });

    it('renders webfinger for the site actor when no artist matches', () => {
      mockDb.getArtistBySlug = jest.fn().mockReturnValue(undefined as any);
      const result = service.generateWebFinger('acct:site@test.com');
      expect(result).toBeTruthy();
      expect(result.subject).toBe('acct:site@test.com');
    });
  });

  describe('generateActor', () => {
    it('renders a Person actor for an artist', () => {
      const actor = service.generateActor({ id: 1, slug: 'test-artist', name: 'Test', public_key: 'pub' } as any);
      expect(actor.type).toBe('Person');
      expect(actor.preferredUsername).toBe('test-artist');
    });

    it('falls back to the site public key for the site actor when none is set on the object', () => {
      mockDb.getSetting = jest.fn().mockImplementation((key) => {
        if (key === 'publicUrl') return 'https://test.com';
        if (key === 'site_public_key') return 'site-pub-key';
        return null;
      });
      const actor = service.generateActor({ slug: 'site', name: 'Instance' } as any);
      expect(actor.publicKey.publicKeyPem).toBe('site-pub-key');
    });
  });

  describe('broadcastComment', () => {
    const track = { id: 5, album_id: 10 };
    const album = { id: 10, artist_id: 1 };
    const artist = { id: 1, slug: 'test-artist', name: 'Test', public_key: 'pub' };
    const follower = { inbox_uri: 'https://remote.test/inbox' };
    const user = { ap_public_key: 'user-pub', ap_private_key: 'user-priv' };

    beforeEach(() => {
      mockDb.getTrack = jest.fn().mockReturnValue(track as any);
      mockDb.getAlbum = jest.fn().mockReturnValue(album as any);
      mockDb.getArtist = jest.fn().mockReturnValue(artist as any);
      mockDb.getFollowers = jest.fn().mockReturnValue([follower] as any);
      mockDb.getUserByUsername = jest.fn().mockReturnValue(user as any);
      mockTransport.send.mockResolvedValue(true);
    });

    it('sends a Create(Note) activity to every follower inbox', async () => {
      await service.broadcastComment(5, 'listener', 'hello <script>');
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const [sendActor, sendInbox, sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendActor).toMatchObject({ slug: 'listener', private_key: 'user-priv', public_key: 'user-pub' });
      expect(sendInbox).toBe('https://remote.test/inbox');
      expect(sendActivity.type).toBe('Create');
      expect(sendActivity.object.content).toContain('&lt;script&gt;');
      expect(sendActivity.object.content).not.toContain('<script>');
    });

    it('is a no-op when the track has no album', async () => {
      mockDb.getTrack = jest.fn().mockReturnValue({ id: 5, album_id: null } as any);
      await service.broadcastComment(5, 'listener', 'hi');
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('is a no-op when the artist has no AP keys', async () => {
      mockDb.getArtist = jest.fn().mockReturnValue({ id: 1, slug: 'test-artist', name: 'Test' } as any);
      await service.broadcastComment(5, 'listener', 'hi');
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('is a no-op when there are no followers', async () => {
      mockDb.getFollowers = jest.fn().mockReturnValue([] as any);
      await service.broadcastComment(5, 'listener', 'hi');
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('is a no-op when the commenting user has no AP keys', async () => {
      mockDb.getUserByUsername = jest.fn().mockReturnValue({ ap_public_key: null } as any);
      await service.broadcastComment(5, 'listener', 'hi');
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastLike / broadcastUnlike', () => {
    const track = { id: 5, album_id: 10 };
    const album = { id: 10, artist_id: 1 };
    const artist = { id: 1, slug: 'test-artist', name: 'Test', public_key: 'pub' };
    const follower = { inbox_uri: 'https://remote.test/inbox' };
    const user = { ap_public_key: 'user-pub', ap_private_key: 'user-priv' };

    beforeEach(() => {
      mockDb.getTrack = jest.fn().mockReturnValue(track as any);
      mockDb.getAlbum = jest.fn().mockReturnValue(album as any);
      mockDb.getArtist = jest.fn().mockReturnValue(artist as any);
      mockDb.getFollowers = jest.fn().mockReturnValue([follower] as any);
      mockDb.getUserByUsername = jest.fn().mockReturnValue(user as any);
      mockTransport.send.mockResolvedValue(true);
    });

    it('broadcasts a Like activity to followers', async () => {
      await service.broadcastLike(5, 'listener');
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const [, , sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendActivity.type).toBe('Like');
      expect(sendActivity.object).toBe('https://test.com/audio/5');
    });

    it('broadcasts an Undo(Like) activity to followers', async () => {
      await service.broadcastUnlike(5, 'listener');
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const [, , sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendActivity.type).toBe('Undo');
      expect(sendActivity.object.type).toBe('Like');
    });

    it('broadcastLike is a no-op without followers', async () => {
      mockDb.getFollowers = jest.fn().mockReturnValue([] as any);
      await service.broadcastLike(5, 'listener');
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe('rejectFollowRequest', () => {
    it('rejects a pending follow request and sends a Reject activity', async () => {
      const actor = { id: 1, slug: 'test-artist', name: 'Test Artist' };
      const actorUri = 'https://remote.test/actor';
      mockDb.getFollower = jest.fn().mockReturnValue({ follow_id: 'https://remote.test/follow-1' } as any);
      mockTransport.send.mockResolvedValueOnce(true);

      await service.rejectFollowRequest(actor as any, actorUri);

      expect(mockDb.rejectFollower).toHaveBeenCalledWith(1, actorUri);
      const [, sendInbox, sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendInbox).toBe('https://remote.test/inbox');
      expect(sendActivity.type).toBe('Reject');
      expect(sendActivity.object.id).toBe('https://remote.test/follow-1');
    });

    it('falls back to removeFollower when rejectFollower is unavailable', async () => {
      const actor = { id: 1, slug: 'test-artist', name: 'Test Artist' };
      delete (mockDb as any).rejectFollower;
      mockTransport.send.mockResolvedValueOnce(true);

      await service.rejectFollowRequest(actor as any, 'https://remote.test/actor');

      expect(mockDb.removeFollower).toHaveBeenCalledWith(1, 'https://remote.test/actor');
    });

    it('does not touch the DB if the inbox cannot be resolved', async () => {
      jest.spyOn(service as any, 'getInboxFromActor').mockResolvedValueOnce(null);
      await service.rejectFollowRequest({ id: 1, slug: 'a' } as any, 'https://remote.test/actor-no-inbox');
      expect(mockDb.rejectFollower).not.toHaveBeenCalled();
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe('announceToRelay', () => {
    it('is a no-op when no relay URL is configured', async () => {
      mockConfig.relayUrl = undefined;
      await service.announceToRelay({ type: 'Create' });
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('is a no-op when no public URL is configured', async () => {
      mockConfig.relayUrl = 'https://relay.test/inbox';
      mockDb.getSetting = jest.fn().mockReturnValue(null);
      mockConfig.publicUrl = undefined;
      await service.announceToRelay({ type: 'Create' });
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('sends an Announce activity to the relay inbox', async () => {
      mockConfig.relayUrl = 'https://relay.test/inbox';
      mockTransport.send.mockResolvedValueOnce(true);

      await service.announceToRelay(new URL('https://test.com/activity/1'));

      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const [sendActor, sendInbox] = mockTransport.send.mock.calls[0];
      expect(sendActor.slug).toBe('site');
      expect(sendInbox).toBe('https://relay.test/inbox');
    });
  });

  describe('broadcastRelease', () => {
    const artist = { id: 1, slug: 'test-artist', name: 'Test' };
    const album = { id: 20, artist_id: 1, slug: 'my-album', title: 'My Album' };

    beforeEach(() => {
      mockDb.getArtist = jest.fn().mockReturnValue(artist as any);
      mockDb.getApNoteByContent = jest.fn().mockReturnValue(undefined);
      mockDb.getTracksByReleaseId = jest.fn().mockReturnValue([] as any);
      mockDb.getFollowerInboxes = jest.fn().mockReturnValue(['https://remote.test/inbox'] as any);
      mockDb.createApNote = jest.fn();
      jest.spyOn((service as any).renderer, 'renderNote').mockReturnValue({ id: 'https://test.com/notes/album-20', type: 'Note' });
      mockTransport.send.mockResolvedValue(true);
    });

    it('broadcasts a Create(Note) activity and records the note', async () => {
      await service.broadcastRelease(album as any);

      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const [, sendInbox, sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendInbox).toBe('https://remote.test/inbox');
      expect(sendActivity.type).toBe('Create');
      expect(mockDb.createApNote).toHaveBeenCalledWith(1, 'https://test.com/notes/album-20', 'release', 20, 'my-album', 'My Album');
    });

    it('skips broadcast when already published and not forced', async () => {
      mockDb.getApNoteByContent = jest.fn().mockReturnValue({ deleted_at: null } as any);
      await service.broadcastRelease(album as any);
      expect(mockTransport.send).not.toHaveBeenCalled();
      expect(mockDb.createApNote).not.toHaveBeenCalled();
    });

    it('re-broadcasts an already-published release when forced', async () => {
      mockDb.getApNoteByContent = jest.fn().mockReturnValue({ deleted_at: null } as any);
      await service.broadcastRelease(album as any, true);
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
    });

    it('respects the publishedReleaseIds set instead of querying the DB', async () => {
      await service.broadcastRelease(album as any, false, new Set([20]));
      expect(mockDb.getApNoteByContent).not.toHaveBeenCalled();
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('is a no-op when the album has no artist', async () => {
      await service.broadcastRelease({ id: 21, artist_id: null } as any);
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastPost', () => {
    const artist = { id: 1, slug: 'test-artist', name: 'Test' };
    const post = { id: 30, artist_id: 1, slug: 'my-post', visibility: 'public', content: '<p>hello</p>' };
    const follower = { inbox_uri: 'https://remote.test/inbox' };

    beforeEach(() => {
      mockDb.getArtist = jest.fn().mockReturnValue(artist as any);
      mockDb.getApNoteByContent = jest.fn().mockReturnValue(undefined);
      mockDb.getFollowers = jest.fn().mockReturnValue([follower] as any);
      mockDb.createApNote = jest.fn();
      jest.spyOn((service as any).renderer, 'renderPostArticle').mockReturnValue({ id: 'https://test.com/notes/post-30', type: 'Article' });
      mockTransport.send.mockResolvedValue(true);
    });

    it('records the note and broadcasts to followers', async () => {
      await service.broadcastPost(post as any);

      expect(mockDb.createApNote).toHaveBeenCalledWith(1, 'https://test.com/notes/post-30', 'post', 30, 'my-post', 'hello');
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const [, sendInbox, sendActivity] = mockTransport.send.mock.calls[0];
      expect(sendInbox).toBe('https://remote.test/inbox');
      expect(sendActivity.type).toBe('Create');
    });

    it('is a no-op for non-public posts', async () => {
      await service.broadcastPost({ ...post, visibility: 'private' } as any);
      expect(mockDb.createApNote).not.toHaveBeenCalled();
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('skips broadcast when already published and not forced', async () => {
      mockDb.getApNoteByContent = jest.fn().mockReturnValue({ deleted_at: null } as any);
      await service.broadcastPost(post as any);
      expect(mockDb.createApNote).not.toHaveBeenCalled();
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('records the note but skips delivery when there are no followers', async () => {
      mockDb.getFollowers = jest.fn().mockReturnValue([] as any);
      await service.broadcastPost(post as any);
      expect(mockDb.createApNote).toHaveBeenCalledTimes(1);
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

});
