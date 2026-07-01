/**
 * Centralized query keys for the cached catalog lists. Use these when reading
 * and when invalidating / patching the cache after a mutation so cache
 * entries line up across the app.
 */
export const queryKeys = {
    artists: ["artists"] as const,
    albums: ["albums"] as const,
    releases: ["releases"] as const,
    catalog: ["catalog"] as const,
    tracks: (mine = false) => ["tracks", { mine }] as const,
};

