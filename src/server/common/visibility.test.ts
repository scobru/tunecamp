
import { VisibilityGuardian, UserRole, Capability, ViewerContext, canConsumeTrack, TrackAccessLookups, getContextFromProfile, VisibilityProfile } from "./visibility.js";

describe("VisibilityGuardian", () => {
  const rootAdmin: ViewerContext = { userId: 1, role: UserRole.ROOT_ADMIN };
  const superUser: ViewerContext = { userId: 2, role: UserRole.SUPER_USER };
  const artist: ViewerContext = { userId: 3, artistId: 10, role: UserRole.SUPER_USER };
  const normalUser: ViewerContext = { userId: 4, role: UserRole.NORMAL_USER };
  const guest: ViewerContext = { role: UserRole.GUEST };

  describe("Capability Checks", () => {
    test("Root Admin should have all capabilities", () => {
      expect(VisibilityGuardian.can(rootAdmin, Capability.VIEW_PRIVATE_LIBRARY)).toBe(true);
      expect(VisibilityGuardian.can(rootAdmin, Capability.MANAGE_PRIVATE_LIBRARY)).toBe(true);
      expect(VisibilityGuardian.can(rootAdmin, Capability.CREATE_RELEASES)).toBe(true);
      expect(VisibilityGuardian.can(rootAdmin, Capability.MANAGE_SYSTEM)).toBe(true);
    });

    test("Super User should see private library but not manage system", () => {
      expect(VisibilityGuardian.can(superUser, Capability.VIEW_PRIVATE_LIBRARY)).toBe(true);
      expect(VisibilityGuardian.can(superUser, Capability.MANAGE_SYSTEM)).toBe(false);
    });

    test("Artist should be able to create releases", () => {
      expect(VisibilityGuardian.can(artist, Capability.CREATE_RELEASES)).toBe(true);
    });

    test("Super User without artistId cannot create releases", () => {
      expect(VisibilityGuardian.can(superUser, Capability.CREATE_RELEASES)).toBe(false);
    });

    test("Normal User should not see private library", () => {
      expect(VisibilityGuardian.can(normalUser, Capability.VIEW_PRIVATE_LIBRARY)).toBe(false);
    });
  });

  describe("canPublishContent", () => {
    test("Root Admin and Manager can publish without an artist link", () => {
      expect(VisibilityGuardian.canPublishContent(rootAdmin)).toBe(true);
      expect(VisibilityGuardian.canPublishContent({ userId: 6, role: UserRole.ADMIN })).toBe(true);
      expect(VisibilityGuardian.canPublishContent({ userId: 6, artistId: 10, role: UserRole.ADMIN })).toBe(true);
    });

    test("Curator can publish only when linked to an artist", () => {
      expect(VisibilityGuardian.canPublishContent(artist)).toBe(true);
      expect(VisibilityGuardian.canPublishContent(superUser)).toBe(false);
    });

    test("Listener without artist link cannot publish; with link can (self-publish mode)", () => {
      expect(VisibilityGuardian.canPublishContent(normalUser)).toBe(false);
      expect(VisibilityGuardian.canPublishContent({ userId: 7, artistId: 10, role: UserRole.NORMAL_USER })).toBe(true);
      expect(VisibilityGuardian.canPublishContent(guest)).toBe(false);
    });
  });

  describe("canWriteContent", () => {
    const listenerArtist: ViewerContext = { userId: 7, artistId: 10, role: UserRole.NORMAL_USER };

    test("Managers and Curators can write even without an artist link", () => {
      expect(VisibilityGuardian.canWriteContent(rootAdmin)).toBe(true);
      expect(VisibilityGuardian.canWriteContent(superUser)).toBe(true);
      expect(VisibilityGuardian.canWriteContent({ userId: 6, role: UserRole.ADMIN })).toBe(true);
    });

    test("A Listener promoted to Artist (user + artistId) can write", () => {
      expect(VisibilityGuardian.canWriteContent(listenerArtist)).toBe(true);
    });

    test("A plain Listener and guests cannot write", () => {
      expect(VisibilityGuardian.canWriteContent(normalUser)).toBe(false);
      expect(VisibilityGuardian.canWriteContent(guest)).toBe(false);
    });
  });

  describe("canManageItem", () => {
    const listenerArtist: ViewerContext = { userId: 7, artistId: 10, role: UserRole.NORMAL_USER };

    test("Managers/Root Admins manage any item", () => {
      expect(VisibilityGuardian.canManageItem(rootAdmin, { owner_id: 999, artist_id: 1 })).toBe(true);
      expect(VisibilityGuardian.canManageItem({ userId: 6, role: UserRole.ADMIN }, { owner_id: 999 })).toBe(true);
    });

    test("Curators do NOT implicitly own other users' items", () => {
      expect(VisibilityGuardian.canManageItem(superUser, { owner_id: 999, artist_id: 1 })).toBe(false);
    });

    test("The direct owner manages their item", () => {
      expect(VisibilityGuardian.canManageItem(listenerArtist, { owner_id: 7, artist_id: 10 })).toBe(true);
    });

    test("A linked Artist manages unowned content carrying their artist_id", () => {
      expect(VisibilityGuardian.canManageItem(listenerArtist, { owner_id: null, artist_id: 10 })).toBe(true);
    });

    test("A linked Artist cannot manage another user's owned content even on the same artist", () => {
      expect(VisibilityGuardian.canManageItem(listenerArtist, { owner_id: 999, artist_id: 10 })).toBe(false);
    });

    test("An unrelated artist/listener cannot manage the item", () => {
      expect(VisibilityGuardian.canManageItem(listenerArtist, { owner_id: 999, artist_id: 55 })).toBe(false);
      expect(VisibilityGuardian.canManageItem(normalUser, { owner_id: 999, artist_id: 55 })).toBe(false);
    });
  });

  describe("Context Derivation", () => {
    test("should derive correct context from user object", () => {
      const user = { userId: 5, role: 'super_user', isActive: true };
      const context = VisibilityGuardian.deriveContext(user);
      expect(context.role).toBe(UserRole.SUPER_USER);
      expect(context.userId).toBe(5);
    });

    test("should downgrade role if inactive", () => {
      const user = { userId: 5, role: 'root_admin', isActive: false };
      const context = VisibilityGuardian.deriveContext(user);
      expect(context.role).toBe(UserRole.GUEST);
    });
  });

  describe("SQL Filters", () => {
    test("getTrackFilter should return correct SQL for Guest", () => {
      const filter = VisibilityGuardian.getTrackFilter({ role: UserRole.GUEST });
      expect(filter.sql).toContain("album_status = 'released'");
      expect(filter.params).toHaveLength(0);
    });

    test("getTrackFilter should return correct SQL for User", () => {
      const filter = VisibilityGuardian.getTrackFilter({ role: UserRole.NORMAL_USER, userId: 42 });
      expect(filter.sql).toContain("effective_owner_id = ?");
      expect(filter.params).toEqual([42, 42, 42]);
    });

    test("getTrackFilter should return correct SQL for User with artistId", () => {
      const filter = VisibilityGuardian.getTrackFilter({ role: UserRole.NORMAL_USER, userId: 42, artistId: 10 });
      expect(filter.sql).toContain("effective_owner_id = ?");
      expect(filter.sql).toContain("artist_id = ?");
      expect(filter.params).toEqual([42, 42, 42, 10]);
    });

    test("getTrackFilter should return 1=1 for Admin", () => {
      const filter = VisibilityGuardian.getTrackFilter({ role: UserRole.ADMIN });
      expect(filter.sql).toBe("1=1");
      expect(filter.params).toHaveLength(0);
    });

    test("getAlbumFilter should return correct SQL for Guest", () => {
      const filter = VisibilityGuardian.getAlbumFilter({ role: UserRole.GUEST });
      expect(filter.sql).toContain("status = 'released'");
      expect(filter.params).toHaveLength(0);
    });

    test("getAlbumFilter should return correct SQL for User", () => {
      const filter = VisibilityGuardian.getAlbumFilter({ role: UserRole.NORMAL_USER, userId: 42 });
      expect(filter.sql).toContain("owner_id = ?");
      expect(filter.params).toEqual([42, 42]);
    });

    test("getAlbumFilter should return correct SQL for User with artistId", () => {
      const filter = VisibilityGuardian.getAlbumFilter({ role: UserRole.NORMAL_USER, userId: 42, artistId: 10 });
      expect(filter.sql).toContain("owner_id = ?");
      expect(filter.sql).toContain("artist_id = ?");
      expect(filter.params).toEqual([42, 42, 10]);
    });

    test("getAlbumFilter should return 1=1 for Admin", () => {
      const filter = VisibilityGuardian.getAlbumFilter({ role: UserRole.ADMIN });
      expect(filter.sql).toBe("1=1");
      expect(filter.params).toHaveLength(0);
    });
  });

  describe("canConsumeTrack", () => {
    // Lookups that record whether the (expensive) DB calls were reached.
    function makeLookups(over: Partial<{
      albumVisibility: string;
      inPublicPlaylist: boolean;
    }> = {}): TrackAccessLookups & { calls: number } {
      const state = { calls: 0 };
      return {
        calls: 0,
        getRelease() { return undefined; },
        getAlbum(_id: number) {
          (state as any).calls++;
          return { visibility: over.albumVisibility ?? "public" };
        },
        isTrackInPublicPlaylist(_id: number) {
          return over.inPublicPlaylist ?? false;
        },
        get _calls() { return state.calls; },
      } as any;
    }

    const albumTrack = { id: 1, owner_id: 100, artist_id: 10, album_id: 50, file_path: "a.mp3" };
    const orphanTrack = { id: 2, owner_id: 100, artist_id: 10, album_id: null, file_path: "b.mp3" };
    const externalTrack = { id: 3, owner_id: null, artist_id: null, album_id: null, file_path: null };

    test("Curator/Admin (VIEW_PRIVATE_LIBRARY) always consumes — no DB lookup", () => {
      const lookups = makeLookups({ albumVisibility: "private" });
      expect(canConsumeTrack(albumTrack, { userId: 9, role: UserRole.SUPER_USER }, lookups)).toBe(true);
      expect((lookups as any)._calls).toBe(0); // fast-path: never hit the album lookup
    });

    test("Owner by user id consumes their own private track", () => {
      const lookups = makeLookups({ albumVisibility: "private" });
      expect(canConsumeTrack(albumTrack, { userId: 100, role: UserRole.NORMAL_USER }, lookups)).toBe(true);
    });

    test("Linked artist consumes a track carrying their artist_id", () => {
      const lookups = makeLookups({ albumVisibility: "private" });
      expect(canConsumeTrack(albumTrack, { userId: 999, artistId: 10, role: UserRole.NORMAL_USER }, lookups)).toBe(true);
    });

    test("Stranger denied on a private album track not in a public playlist", () => {
      const lookups = makeLookups({ albumVisibility: "private", inPublicPlaylist: false });
      expect(canConsumeTrack(albumTrack, { userId: 7, role: UserRole.NORMAL_USER }, lookups)).toBe(false);
    });

    test("Stranger allowed on a private album track surfaced via a public playlist", () => {
      const lookups = makeLookups({ albumVisibility: "private", inPublicPlaylist: true });
      expect(canConsumeTrack(albumTrack, { userId: 7, role: UserRole.NORMAL_USER }, lookups)).toBe(true);
    });

    test("Stranger allowed on a public album track", () => {
      const lookups = makeLookups({ albumVisibility: "public" });
      expect(canConsumeTrack(albumTrack, { userId: 7, role: UserRole.NORMAL_USER }, lookups)).toBe(true);
    });

    test("Orphan private file: denied unless in a public playlist", () => {
      expect(canConsumeTrack(orphanTrack, { userId: 7, role: UserRole.NORMAL_USER }, makeLookups({ inPublicPlaylist: false }))).toBe(false);
      expect(canConsumeTrack(orphanTrack, { userId: 7, role: UserRole.NORMAL_USER }, makeLookups({ inPublicPlaylist: true }))).toBe(true);
    });

    test("External/link track requires login", () => {
      expect(canConsumeTrack(externalTrack, { role: UserRole.GUEST }, makeLookups())).toBe(false);
      expect(canConsumeTrack(externalTrack, { userId: 7, role: UserRole.NORMAL_USER }, makeLookups())).toBe(true);
    });
  });

  describe("getContextFromProfile", () => {
    test("should return GUEST role when profile is undefined", () => {
      expect(getContextFromProfile(undefined)).toEqual({ role: UserRole.GUEST });
    });

    test("should return GUEST role when profile is null", () => {
      // @ts-ignore
      expect(getContextFromProfile(null)).toEqual({ role: UserRole.GUEST });
    });

    test("should return the exact profile if it is a ViewerContext object with a role", () => {
      const viewerContext: ViewerContext = { userId: 5, role: UserRole.NORMAL_USER };
      expect(getContextFromProfile(viewerContext)).toEqual(viewerContext);
    });

    test("should return ROOT_ADMIN role when profile is VisibilityProfile.ALL_ACCESS", () => {
      expect(getContextFromProfile(VisibilityProfile.ALL_ACCESS)).toEqual({ role: UserRole.ROOT_ADMIN });
    });

    test("should return GUEST role for any other VisibilityProfile value", () => {
      expect(getContextFromProfile(VisibilityProfile.PUBLIC_STAGE)).toEqual({ role: UserRole.GUEST });
      expect(getContextFromProfile(VisibilityProfile.OWNER_SCOPED)).toEqual({ role: UserRole.GUEST });
    });

    test("should return GUEST role when profile is an object without a role", () => {
      // @ts-ignore
      expect(getContextFromProfile({ userId: 5 })).toEqual({ role: UserRole.GUEST });
    });

    test("should return GUEST role when profile is of unexpected primitive types", () => {
      // @ts-ignore
      expect(getContextFromProfile(123)).toEqual({ role: UserRole.GUEST });
      // @ts-ignore
      expect(getContextFromProfile("invalid_string")).toEqual({ role: UserRole.GUEST });
      // @ts-ignore
      expect(getContextFromProfile(true)).toEqual({ role: UserRole.GUEST });
      // @ts-ignore
      expect(getContextFromProfile([])).toEqual({ role: UserRole.GUEST });
    });
  });
});
