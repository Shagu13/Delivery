import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

// Module-level singleton so route remounts (tab switches, etc.) reuse the same cache
// instead of wiping it. Defaults favor "instant from cache, quietly revalidate": data
// is treated as fresh for 30s (no refetch on a quick re-visit), kept around for 30min
// after last use (admins tab-hop across pages over a shift and shouldn't hit a loading
// spinner just for coming back to one after a break), and SignalR-driven invalidation
// (not window refocus) is what should actually trigger a background refresh for
// realtime pages.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

// Persists the query cache to IndexedDB so a hard refresh (or reopening the tab)
// repaints instantly from the last-known data instead of showing a loading spinner
// while every query refetches from scratch. A background refetch still happens right
// after restore (the restored data is normally older than staleTime), so numbers
// self-correct within moments — this only changes what's on screen while that happens.
const idbStorage = {
    getItem: async (key: string) => (await idbGet(key)) ?? null,
    setItem: async (key: string, value: string) => { await idbSet(key, value); },
    removeItem: async (key: string) => { await idbDel(key); },
};

export const persister = createAsyncStoragePersister({
    storage: idbStorage,
    key: 'delivery-rq-cache',
});

// Bump this when a DTO shape changes in a way old persisted JSON can't satisfy —
// invalidates every browser's persisted cache on next load instead of risking a
// crash from rendering stale-shaped data against new component code.
export const QUERY_CACHE_BUSTER = 'v1';
