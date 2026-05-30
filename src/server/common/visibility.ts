
/**
 * Visibility Guardian — Deep module for centralizing access control.
 * Encapsulates the logic of "Santuario" (Private Library) vs "Arena" (Public Stage).
 */

export enum UserRole {
  GUEST = 'guest',
  NORMAL_USER = 'user',
  SUPER_USER = 'super_user',
  ADMIN = 'admin',
  ROOT_ADMIN = 'root_admin'
}

export enum Capability {
  VIEW_PRIVATE_LIBRARY = 'VIEW_PRIVATE_LIBRARY',
  MANAGE_PRIVATE_LIBRARY = 'MANAGE_PRIVATE_LIBRARY',
  CREATE_RELEASES = 'CREATE_RELEASES',
  MANAGE_ALL_CONTENT = 'MANAGE_ALL_CONTENT',
  MANAGE_SYSTEM = 'MANAGE_SYSTEM'
}

/**
 * Visibility Profile — Defines the scope of database read operations.
 */
export enum VisibilityProfile {
  ALL_ACCESS = 'ALL_ACCESS',       // See everything (Admin/SuperUser)
  PUBLIC_STAGE = 'PUBLIC_STAGE',   // See only released, public content
  OWNER_SCOPED = 'OWNER_SCOPED'    // See public content + own private library
}

export interface ViewerContext {
  userId?: number | null;
  artistId?: number | null;
  role: UserRole;
  isActive?: boolean;
}

export interface SqlFilter {
  sql: string;
  params: any[];
}

export class VisibilityGuardian {
  /**
   * Translates a ViewerContext into a database access profile.
   * This is the single source of truth for read scoping.
   */
  static getProfile(context: ViewerContext): VisibilityProfile {
    const role = context.role;

    // 1. Full Access: Admins and Super Users can see the entire Private Library
    if ([UserRole.ROOT_ADMIN, UserRole.ADMIN, UserRole.SUPER_USER].includes(role)) {
      return VisibilityProfile.ALL_ACCESS;
    }

    // 2. Owner Scoped: Logged-in users who aren't super users see public stage + their own files
    if (context.userId) {
      return VisibilityProfile.OWNER_SCOPED;
    }

    // 3. Guest/Anonymous: Public Stage only
    return VisibilityProfile.PUBLIC_STAGE;
  }

  /**
   * Helper to check if a role has administrative capabilities (access to admin area)
   */
  static isAdminRole(role: UserRole): boolean {
    return [UserRole.ROOT_ADMIN, UserRole.ADMIN].includes(role);
  }

  /**
   * Translates database user roles to the Visibility Guardian's internal roles.
   */
  static deriveRole(role: string, isActive: boolean = true): UserRole {
    if (!isActive) return UserRole.GUEST;
    switch (role) {
      case 'root_admin': return UserRole.ROOT_ADMIN;
      case 'admin': return UserRole.ADMIN;
      case 'super_user': return UserRole.SUPER_USER;
      case 'user': return UserRole.NORMAL_USER;
      default: return UserRole.GUEST;
    }
  }

  /**
   * Translates a user object (e.g. from an Express request) to a ViewerContext.
   */
  static deriveContext(user: any): ViewerContext {
    let role = user.role;
    
    // If role is not explicitly provided, derive it from common flags (useful for tests and simple requests)
    if (!role) {
      if (user.isRootAdmin) role = UserRole.ROOT_ADMIN;
      else if (user.isAdmin) role = UserRole.ADMIN;
      else if (user.isSuperUser) role = UserRole.SUPER_USER;
      else if (user.username) role = UserRole.NORMAL_USER;
      else role = UserRole.GUEST;
    }

    return {
      userId: user.userId || null,
      artistId: user.artistId || null,
      role: typeof role === 'string' ? this.deriveRole(role, user.isActive !== false) : (role || UserRole.GUEST)
    };
  }

  /**
   * Checks if a viewer has a specific capability.
   */
  static can(context: ViewerContext, capability: Capability): boolean {
    const role = context.role;

    switch (capability) {
      case Capability.VIEW_PRIVATE_LIBRARY:
        return [UserRole.ROOT_ADMIN, UserRole.ADMIN, UserRole.SUPER_USER].includes(role);
      
      case Capability.MANAGE_PRIVATE_LIBRARY:
        return [UserRole.ROOT_ADMIN, UserRole.ADMIN, UserRole.SUPER_USER].includes(role);

      case Capability.CREATE_RELEASES:
        // Artists are Super Users or Admins with an associated artist_id.
        // Root Admin is omnipotent.
        if (role === UserRole.ROOT_ADMIN) return true;
        return [UserRole.ADMIN, UserRole.SUPER_USER].includes(role) && !!context.artistId;

      case Capability.MANAGE_ALL_CONTENT:
        return [UserRole.ROOT_ADMIN, UserRole.ADMIN].includes(role);

      case Capability.MANAGE_SYSTEM:
        return role === UserRole.ROOT_ADMIN;

      default:
        return false;
    }
  }

  /**
   * Returns criteria for filtering content based on visibility and ownership.
   * This is the "high-leverage" interface for database queries.
   */
  static getVisibilityCriteria(context: ViewerContext) {
    const canSeePrivate = this.can(context, Capability.VIEW_PRIVATE_LIBRARY);
    
    return {
      // In Arena: everyone sees public releases.
      // In Santuario: only Super Users and above see everything.
      includePrivate: canSeePrivate,
      
      // Ownership filter: if not a Super User, you only see your own content or public releases.
      // But based on the user's rules, Normal Users only see public stuff.
      onlyPublicIfNoRole: !canSeePrivate,
      
      userId: context.userId
    };
  }

  /**
   * Generates a secure SQL filter clause for tracks based on the viewer context.
   */
  static getTrackFilter(context: ViewerContext, tableAlias = 'v_tracks'): SqlFilter {
    const role = context.role;
    const userId = context.userId;

    // 1. Admins and Super Users see all tracks
    if ([UserRole.ROOT_ADMIN, UserRole.ADMIN, UserRole.SUPER_USER].includes(role)) {
      return { sql: '1=1', params: [] };
    }

    // 2. Logged-in users see public tracks + tracks they own
    if (userId) {
      return {
        sql: `(
          (${tableAlias}.album_status = 'released' AND ${tableAlias}.album_visibility IN ('public', 'unlisted'))
          OR ${tableAlias}.effective_owner_id = ?
        )`,
        params: [userId]
      };
    }

    // 3. Guests see only public tracks
    return {
      sql: `(${tableAlias}.album_status = 'released' AND ${tableAlias}.album_visibility IN ('public', 'unlisted'))`,
      params: []
    };
  }

  /**
   * Generates a secure SQL filter clause for albums based on the viewer context.
   */
  static getAlbumFilter(context: ViewerContext, tableAlias = 'v_albums'): SqlFilter {
    const role = context.role;
    const userId = context.userId;

    // 1. Admins and Super Users see all albums
    if ([UserRole.ROOT_ADMIN, UserRole.ADMIN, UserRole.SUPER_USER].includes(role)) {
      return { sql: '1=1', params: [] };
    }

    // 2. Logged-in users see public albums + albums they own
    if (userId) {
      return {
        sql: `(
          (${tableAlias}.status = 'released' AND ${tableAlias}.visibility IN ('public', 'unlisted'))
          OR ${tableAlias}.owner_id = ?
          OR EXISTS (SELECT 1 FROM album_ownership ao WHERE ao.album_id = ${tableAlias}.id AND ao.owner_id = ?)
        )`,
        params: [userId, userId]
      };
    }

    // 3. Guests see only public albums
    return {
      sql: `(${tableAlias}.status = 'released' AND ${tableAlias}.visibility IN ('public', 'unlisted'))`,
      params: []
    };
  }

  /**
   * Checks if a specific item should be visible to the viewer.
   * Centralizes the logic for Public Stage vs Private Library + Approval Status.
   */
  static isItemVisible(item: { visibility?: string, status?: string, owner_id?: number | null }, context: ViewerContext): boolean {
    // 1. Admins see everything
    if (this.can(context, Capability.MANAGE_ALL_CONTENT)) return true;

    // 2. Owners see their own content (even drafts/pending)
    if (context.userId && item.owner_id === context.userId) return true;

    // 3. Public consumption logic
    const visibility = item.visibility || 'public';
    if (visibility === 'public' || visibility === 'unlisted') {
      // ONLY 'released' content is visible to the public or other users
      return item.status === 'released';
    }

    // 4. Everything else is private
    return false;
  }

  /**
   * Specifically for the Artist list/listing.
   * If the user is a base user (cannot view private library), 
   * they only see artists with formal releases.
   */
  static canSeeArtistInList(artist: { id: number, visibility?: string }, context: ViewerContext, hasFormalRelease: boolean): boolean {
    // 1. Admins/SuperUsers see everyone
    if (this.can(context, Capability.VIEW_PRIVATE_LIBRARY)) return true;

    // 2. Owners see their own artist profile
    if (context.artistId && artist.id === context.artistId) return true;

    // 3. Public visibility: Only if public/unlisted AND has a formal release
    const isVisibleToPublic = artist.visibility === 'public' || artist.visibility === 'unlisted';
    return isVisibleToPublic && hasFormalRelease;
  }
}

export function getContextFromProfile(profile?: VisibilityProfile | ViewerContext): ViewerContext {
    if (!profile) return { role: UserRole.GUEST };
    if (typeof profile === 'object' && 'role' in profile) return profile as ViewerContext;
    if (profile === VisibilityProfile.ALL_ACCESS) return { role: UserRole.ROOT_ADMIN };
    return { role: UserRole.GUEST };
}
