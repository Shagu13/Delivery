import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** A realtime ping inside this window after a fetch is treated as the echo of the admin's own action. */
export const SELF_ECHO_MS = 4000;

/**
 * True when the query is fetching right now or finished fetching within `windowMs`.
 *
 * Reads the query cache at call time. The `useQuery` result (`isFetching`, `dataUpdatedAt`) is a
 * per-render snapshot, so a SignalR ping handler closing over it still sees "idle" for the few
 * milliseconds between an action's own `refetch()` starting and React re-rendering - exactly when
 * the echo ping arrives - and would fire a second identical refetch.
 */
export function isQueryFreshLive(
    queryClient: QueryClient,
    queryKey: QueryKey,
    windowMs: number = SELF_ECHO_MS,
): boolean {
    const state = queryClient.getQueryState(queryKey);
    if (!state) return false;
    return state.fetchStatus === 'fetching' || Date.now() - state.dataUpdatedAt < windowMs;
}
