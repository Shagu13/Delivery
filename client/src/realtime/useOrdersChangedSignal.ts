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
 */
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
        return subscribeOrdersChanged(token, event, () => cb.current());
    }, [token, event, enabled]);
}
