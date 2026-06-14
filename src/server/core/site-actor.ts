/**
 * Site Actor identity helpers.
 *
 * The instance-level ActivityPub actor has the fixed internal id -1. Its public
 * federation handle was historically the literal string "site" (e.g. @site@domain).
 * To let the handle reflect the instance name instead, the handle is resolved from
 * the `siteHandle` setting, falling back to "site" for instances that never set it
 * (preserving backward compatibility / already-federated instances).
 *
 * The internal id (-1) is the real identity and never changes — only the public
 * handle string mapped to it does.
 */

/** Internal sentinel id for the instance-level (Service) actor. */
export const SITE_ACTOR_ID = -1;

/** Legacy/default handle used as fallback when `siteHandle` is not set. */
export const DEFAULT_SITE_HANDLE = "site";

interface SettingReader {
    getSetting(key: string): string | undefined | null;
}

/**
 * Resolve the public federation handle for the instance actor.
 * Returns the configured `siteHandle`, or "site" when unset.
 */
export function getSiteHandle(db: SettingReader): string {
    return db.getSetting("siteHandle") || DEFAULT_SITE_HANDLE;
}

/**
 * Derive a stable, webfinger-safe slug from an instance name.
 * Mirrors the slug pattern used elsewhere in the repo (see artist.repository.ts).
 */
export function slugifySiteName(name: string | undefined | null): string {
    return (
        (name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || DEFAULT_SITE_HANDLE
    );
}
