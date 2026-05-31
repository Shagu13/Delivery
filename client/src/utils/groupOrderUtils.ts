import type { AdminGroupOrder } from '../api/adminGroupOrders';

// A group order is "completed" if its own status is terminal,
// OR every individual order inside it has reached a terminal status.
// Completed group orders are hidden from the Group Orders page and shown in History instead.

const TERMINAL_GO_STATUSES = new Set([
    'CancelledBySender',
    'CancelledByAdmin',
    'OrderNotAccepted',
    'AllDelivered',
]);

const TERMINAL_ORDER_STATUSES = new Set([
    'DeliveredToRecipient',
    'CancelledBySender',
    'CancelledByAdmin',
    'OrderNotAccepted',
    'ReturnedToSender',
    'ExchangeCompleted',
]);

export function isCompletedGroupOrder(go: AdminGroupOrder): boolean {
    if (TERMINAL_GO_STATUSES.has(go.status)) return true;
    if (go.orders.length > 0 && go.orders.every(o => TERMINAL_ORDER_STATUSES.has(o.status))) return true;
    return false;
}

