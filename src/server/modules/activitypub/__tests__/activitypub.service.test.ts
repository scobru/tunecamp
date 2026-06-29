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
      unfollowActor: jest.fn(),
      removeFollowing: jest.fn(),
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

});
