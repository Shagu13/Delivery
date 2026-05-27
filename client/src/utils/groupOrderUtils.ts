import type { AdminGroupOrder } from '../api/adminGroupOrders';

const TERMINAL_GO_STATUSES = new Set([
    'CancelledBySender',
    'CancelledByAdmin',
    'OrderNotAccepted',
    'AllDelivered',
]);

const TERMINAL_ORDER_STATUSES = new Set([
    'DeliveredToRecipient',
    'CancelledByAdmin',
]);

export function isCompletedGroupOrder(go: AdminGroupOrder): boolean {
    if (TERMINAL_GO_STATUSES.has(go.status)) return true;
    if (go.orders.length > 0 && go.orders.every(o => TERMINAL_ORDER_STATUSES.has(o.status))) return true;
    return false;
}
