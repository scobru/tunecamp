import type { Response, NextFunction } from 'express';
import type { ServiceContainer } from '../core/container.js';
import type { AuthenticatedRequest } from './auth.js';

interface ModuleGuardOptions {
  /**
   * Polarity of the setting.
   * - false (default): "hide" flag — the module is hidden when the value is "true"
   *   (e.g. "hideDig", "hideLive").
   * - true: positive flag — the module is hidden when the value is NOT "true"
   *   (e.g. "chatEnabled", where "true" means enabled).
   */
  invert?: boolean;
  /**
   * When true, administrators (admin / super_user / root_admin) are allowed
   * through even if the module is hidden. Mirrors UI pages that still render
   * the section for admins with a "disabled" banner (e.g. the message board).
   */
  allowAdmin?: boolean;
}

/**
 * Server-side enforcement for the admin "Customize Modules" toggles.
 *
 * Hiding a module in the UI only removes its sidebar link; the underlying API
 * endpoints stay reachable by typing the URL or calling them directly. This
 * guard blocks a whole route group when the module is disabled, so the toggle
 * is authoritative rather than cosmetic.
 */
export function requireModuleEnabled(
  container: ServiceContainer,
  settingKey: string,
  options: ModuleGuardOptions = {},
) {
  const identity = container.identity;
  const { invert = false, allowAdmin = false } = options;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const value = identity.getSetting(settingKey);
      const hidden = invert ? value !== 'true' : value === 'true';
      if (hidden) {
        const isAdmin = !!(req.isAdmin || req.isRootAdmin || req.isSuperUser);
        if (!(allowAdmin && isAdmin)) {
          return res.status(403).json({ error: 'This module is disabled on this instance' });
        }
      }
    } catch (e) {
      // Settings unreadable (transient DB error): fall through rather than brick
      // the instance. The route's own auth/role checks still apply.
      console.warn(`[moduleGuard] Could not read setting '${settingKey}':`, (e as any)?.message);
    }
    next();
  };
}
