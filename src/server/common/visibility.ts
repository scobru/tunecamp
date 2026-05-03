
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
  MANAGE_SYSTEM = 'MANAGE_SYSTEM'
}

export interface ViewerContext {
  userId?: number;
  artistId?: number;
  role: UserRole;
}

export class VisibilityGuardian {
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
  static deriveContext(user: { userId?: number, artistId?: number, role: string, isActive?: boolean }): ViewerContext {
    return {
      userId: user.userId,
      artistId: user.artistId,
      role: this.deriveRole(user.role, user.isActive !== false)
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
        return (
          [UserRole.ADMIN, UserRole.SUPER_USER].includes(role) && 
          context.artistId !== undefined && context.artistId !== null
        );

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
}
