type Role = "admin" | "user" | "super_user" | "root_admin" | null | undefined;

/** Minimal shape needed to decide publishing access (artistId may be a string or numeric id). */
type PublishUser = { artistId?: string | number | null; isRootAdmin?: boolean } | null | undefined;

/**
 * Roles that, when linked to an artist, may publish content.
 * Mirrors the backend VisibilityGuardian.canPublishContent
 * (src/server/common/visibility.ts).
 */
const PUBLISHING_ROLES = new Set(["admin", "super_user", "user"]);

/**
 * Whether the current user may publish content (releases, uploads, store assets).
 *
 * The gate is the artist-profile link, NOT the role: a listener in self-publish
 * mode (role "user" + artistId) can publish. Root admins can always publish.
 * Keep this in sync with VisibilityGuardian.canPublishContent on the server.
 */
export function canPublish(
  user: PublishUser,
  role: Role,
): boolean {
  if (user?.isRootAdmin || role === "root_admin") return true;
  return !!user?.artistId && PUBLISHING_ROLES.has(role ?? "");
}
