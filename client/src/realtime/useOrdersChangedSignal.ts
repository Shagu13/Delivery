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
 */
const ADMIN_PING_DEBOUNCE_MS = 700;

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
        const delay = event === 'adminOrdersChanged' ? ADMIN_PING_DEBOUNCE_MS : 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const unsubscribe = subscribeOrdersChanged(token, event, () => {
            if (delay === 0) { cb.current(); return; }
            clearTimeout(timer);
            timer = setTimeout(() => cb.current(), delay);
        });
        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
    }, [token, event, enabled]);
}
