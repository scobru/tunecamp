
import { VisibilityGuardian, UserRole, Capability, ViewerContext } from "./visibility.js";

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
    test("Root Admin can publish without an artist link, but Admin cannot", () => {
      expect(VisibilityGuardian.canPublishContent(rootAdmin)).toBe(true);
      expect(VisibilityGuardian.canPublishContent({ userId: 6, role: UserRole.ADMIN })).toBe(false);
      expect(VisibilityGuardian.canPublishContent({ userId: 6, artistId: 10, role: UserRole.ADMIN })).toBe(true);
    });

    test("Curator can publish only when linked to an artist", () => {
      expect(VisibilityGuardian.canPublishContent(artist)).toBe(true);
      expect(VisibilityGuardian.canPublishContent(superUser)).toBe(false);
    });

    test("Listener cannot publish, even with a stale artist link", () => {
      expect(VisibilityGuardian.canPublishContent(normalUser)).toBe(false);
      expect(VisibilityGuardian.canPublishContent({ userId: 7, artistId: 10, role: UserRole.NORMAL_USER })).toBe(false);
      expect(VisibilityGuardian.canPublishContent(guest)).toBe(false);
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
});
