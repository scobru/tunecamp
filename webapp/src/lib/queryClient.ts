import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client.
 *
 * Lists are served by the API with a weak ETag, so the browser already
 * revalidates cheaply (304). React Query adds the in-memory layer on top:
 * navigating back to a page within `staleTime` renders instantly from cache
 * with no spinner, and concurrent components asking for the same list share a
 * single request instead of each firing their own.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,        // 30s: reused across navigation without refetch
            gcTime: 5 * 60_000,       // keep unused data 5min before garbage-collecting
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});
