import { useEffect, useState } from 'react';
import { subscribePendingCounts } from './pendingCountsConnection';
import type { PendingCounts } from './pendingCountsConnection';

/**
 * Live admin badge counts (pending group orders + open return/exchange orders),
 * pushed over SignalR. Replaces the old 30-second polling. Returns zeros until
 * the first push arrives, and for non-admins / signed-out users.
 */
export function useAdminPendingCounts(token: string | null, isAdmin: boolean): PendingCounts {
    const [counts, setCounts] = useState<PendingCounts>({ pendingGroupOrders: 0, returnExchange: 0 });

    useEffect(() => {
        if (!isAdmin || !token) return;
        return subscribePendingCounts(token, setCounts);
    }, [token, isAdmin]);

    return counts;
}
