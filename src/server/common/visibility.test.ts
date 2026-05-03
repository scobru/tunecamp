
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
});
