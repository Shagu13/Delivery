import { useEffect, useRef } from 'react';
import { subscribeOrdersChanged } from './pendingCountsConnection';

/**
 * Runs `onChanged` whenever the backend pushes an "orders changed" ping over SignalR,
 * so a dashboard can silently refetch instead of polling or being manually refreshed.
 *
 * - Admin dashboards pass event 'adminOrdersChanged' (any order placed/changed).
 * - Courier dashboards pass event 'courierOrdersChanged' (something assigned to them).
 *
 * `onChanged` is held in a ref, so passing a fresh closure each render does not
 * re-open the subscription. Inactive (no token / disabled) subscribers are skipped.
 *
 * Admin pings are debounced (trailing). The server sends the ping when the save commits, i.e.
 * BEFORE the acting admin's own HTTP response returns — so without a delay the ping reaches the
 * page first, finds nothing fresh, and refetches; then the action's own direct reload refetches
 * again (the pages' "skip if fetched moments ago" guards only help when the direct reload wins).
 * Waiting a beat lets that direct reload land first so those guards skip the echo, and folds a
 * burst of pings (several saves in a row) into one refetch. Courier pings stay immediate — a
 * courier waiting for a new order shouldn't wait on a debounce.
 *
 * Admin pings also respect the database's budget (every refetch of a busy admin page is several
 * heavy queries, multiplied by every open admin tab):
 * - the trailing window is capped by ADMIN_PING_MAX_WAIT_MS, so steady activity (a save every
 *   second) refreshes at most every few seconds instead of once per save, yet never starves;
 * - a hidden tab doesn't refetch at all — it remembers a ping arrived and refetches once when it
 *   becomes visible again (refetchOnWindowFocus is off, so this is its only catch-up).
 */
const ADMIN_PING_DEBOUNCE_MS = 1500;
const ADMIN_PING_MAX_WAIT_MS = 4000;

export function useOrdersChangedSignal(
    token: string | null,
    event: 'adminOrdersChanged' | 'courierOrdersChanged',
    onChanged: () => void,
    enabled = true,
): void {
    const cb = useRef(onChanged);
    cb.current = onChanged;

    useEffect(() => {
        if (!enabled || !token) return;

        if (event !== 'adminOrdersChanged') {
            return subscribeOrdersChanged(token, event, () => cb.current());
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        let firstPingAt: number | null = null;   // start of the current debounce window
        let pendingWhileHidden = false;

        const fire = () => {
            clearTimeout(timer);
            timer = undefined;
            firstPingAt = null;
            cb.current();
        };

        const unsubscribe = subscribeOrdersChanged(token, event, () => {
            if (document.hidden) { pendingWhileHidden = true; return; }
            const now = Date.now();
            firstPingAt ??= now;
            const untilMaxWait = firstPingAt + ADMIN_PING_MAX_WAIT_MS - now;
            clearTimeout(timer);
            timer = setTimeout(fire, Math.max(0, Math.min(ADMIN_PING_DEBOUNCE_MS, untilMaxWait)));
        });

        const onVisibility = () => {
            if (document.hidden || !pendingWhileHidden) return;
            pendingWhileHidden = false;
            fire();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            unsubscribe();
        };
    }, [token, event, enabled]);
}
