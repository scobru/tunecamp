import { useQuery } from "@tanstack/react-query";
import API from "../services/api";


/**
 * Centralized query keys for the cached catalog lists. Use these when reading
 * (the hooks below) and when invalidating / patching the cache after a mutation
 * so cache entries line up across the app.
 */
export const queryKeys = {
    artists: ["artists"] as const,
    albums: ["albums"] as const,
    releases: ["releases"] as const,
    catalog: ["catalog"] as const,
    tracks: (mine = false) => ["tracks", { mine }] as const,
};

type QueryOpts = { enabled?: boolean };

export function useArtists(options: QueryOpts = {}) {
    return useQuery({
        queryKey: queryKeys.artists,
        queryFn: () => API.getArtists(),
        enabled: options.enabled ?? true,
    });
}

export function useAlbums(options: QueryOpts = {}) {
    return useQuery({
        queryKey: queryKeys.albums,
        queryFn: () => API.getAlbums(),
        enabled: options.enabled ?? true,
    });
}

export function useReleases(options: QueryOpts = {}) {
    return useQuery({
        queryKey: queryKeys.releases,
        queryFn: () => API.getReleases(),
        enabled: options.enabled ?? true,
    });
}

export function useCatalog(options: QueryOpts = {}) {
    return useQuery({
        queryKey: queryKeys.catalog,
        queryFn: () => API.getCatalog(),
        enabled: options.enabled ?? true,
    });
}

export function useTracks(options: { mine?: boolean } & QueryOpts = {}) {
    const mine = !!options.mine;
    return useQuery({
        queryKey: queryKeys.tracks(mine),
        queryFn: () => API.getTracks({ mine }),
        enabled: options.enabled ?? true,
    });
}

