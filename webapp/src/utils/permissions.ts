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

/** Roles that manage ANY catalog item regardless of ownership (MANAGE_ALL_CONTENT). */
const FULL_MANAGE_ROLES = new Set(["admin", "root_admin"]);

/** Minimal shape needed to decide per-item management. */
type ManageUser = { userId?: number | null; artistId?: string | number | null; isRootAdmin?: boolean } | null | undefined;

/**
 * Whether the current user may MANAGE (edit / publish / delete) a specific
 * catalog item. Mirrors the backend VisibilityGuardian.canManageItem
 * (src/server/common/visibility.ts): Managers/Root Admins manage everything;
 * everyone else (Curator, Listener-Artist) only their own content.
 *
 * Note: the auth store does not currently expose the numeric userId, so the
 * owner_id check only fires if a userId is present. The artist_id match covers
 * the self-publish case (a user's own releases carry their artistId). The
 * server enforces the real gate regardless of this client-side affordance.
 */
export function canManageItem(
  user: ManageUser,
  role: Role,
  item: { owner_id?: number | null; artist_id?: number | null } | null | undefined,
): boolean {
  if (user?.isRootAdmin || FULL_MANAGE_ROLES.has(role ?? "")) return true;
  if (!item) return false;
  if (user?.userId != null && item.owner_id === user.userId) return true;
  if (
    user?.artistId != null &&
    item.artist_id != null &&
    String(item.artist_id) === String(user.artistId)
  ) return true;
  return false;
}
