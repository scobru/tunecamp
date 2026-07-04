/**
 * Shared role → UI label/badge mapping (sidebar, board, anywhere a role chip
 * is rendered). `hasArtistProfile` distinguishes a self-publish listener
 * ("Artist") from a plain listener when the caller knows the artist link.
 */
export const getRoleLabel = (role: string | null | undefined, hasArtistProfile = false): string => {
  switch (role) {
    case "root_admin": return "Root Admin";
    case "admin": return "Manager";
    case "super_user": return "Curator";
    case "user": return hasArtistProfile ? "Artist" : "Listener";
    default: return "Listener";
  }
};

export const getRoleBadgeClass = (role: string | null | undefined, hasArtistProfile = false): string => {
  switch (role) {
    case "root_admin": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "admin": return "bg-primary/10 text-primary border-primary/20";
    case "super_user": return "bg-secondary/10 text-secondary border-secondary/20";
    case "user":
      if (hasArtistProfile) return "bg-accent/10 text-accent border-accent/20";
      return "bg-base-content/5 text-base-content/60 border-base-content/10";
    default: return "bg-base-content/5 text-base-content/60 border-base-content/10";
  }
};
