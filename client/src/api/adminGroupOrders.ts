const BASE = '/api/grouporders';

export type OrderStatus =
    | 'Pending'
    | 'AcceptedGroupOrder'
    | 'AcceptedOrder'
    | 'OrderNotAccepted'
    | 'CourierAssignedToPickUp'
    | 'CourierOnTheWayToPickUp'
    | 'CourierDeliveringToWarehouse'
    | 'DeliveredToWarehouse'
    | 'AdminAcceptedOrderInWareHouse'
    | 'OrderIsOnItsWayToRecipientsCity'
    | 'CourierAssignedToDeliver'
    | 'CourierRecievedOrderToDeliver'
    | 'OrderIsBeingDeliveredToRecipient'
    | 'DeliveredToRecipient'
    | 'CancelledBySender';

export interface AdminOrder {
    id: string;
    trackingNumber: string;
    recipientFirstName: string;
    recipientLastName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description: string | null;
    status: OrderStatus;
    isPaid: boolean;
    courierId: string | null;
    createdAt: string;
}

export interface AdminGroupOrder {
    id: string;
    createdAt: string;
    status: OrderStatus;
    senderFirstName: string;
    senderLastName: string;
    senderIdNumber: string | null;
    senderBusinessName: string;
    senderPhone: string;
    pickUpCity: string;
    pickUpDistrict: string;
    pickUpAddress: string;
    note: string | null;
    numberOfPackages: number;
    courierId: string | null;
    courierFullName: string | null;
    orders: AdminOrder[];
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function fetchGroupOrders(token: string, search?: string): Promise<AdminGroupOrder[]> {
    const url = search ? `${BASE}?search=${encodeURIComponent(search)}` : BASE;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch group orders');
    return res.json();
}

export async function fetchMyPickups(token: string): Promise<AdminGroupOrder[]> {
    const res = await fetch(`${BASE}/my-pickups`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch pickups');
    return res.json();
}

// ── Shared action helper ──────────────────────────────────────────────────────

async function groupOrderAction(
    token: string,
    id: string,
    action: string,
    body?: object,
): Promise<void> {
    const res = await fetch(`${BASE}/${id}/${action}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Unknown error' }));
        throw new Error(err.title ?? 'Request failed');
    }
}

// ── Admin actions ─────────────────────────────────────────────────────────────

export const acceptGroupOrder =
    (token: string, id: string) => groupOrderAction(token, id, 'accept');

export const declineGroupOrder =
    (token: string, id: string) => groupOrderAction(token, id, 'decline');

export const assignCourierToGroupOrder =
    (token: string, id: string, courierId: string) =>
        groupOrderAction(token, id, 'assign-courier', { courierId });

export const acceptGroupOrderInWarehouse =
    (token: string, id: string) => groupOrderAction(token, id, 'accept-in-warehouse');

export const cancelGroupOrder =
    (token: string, id: string) => groupOrderAction(token, id, 'cancel');

// ── Courier actions ───────────────────────────────────────────────────────────

export const markPickingUp =
    (token: string, id: string) => groupOrderAction(token, id, 'picking-up');

export const markPickedUp =
    (token: string, id: string) => groupOrderAction(token, id, 'picked-up');

export const markDeliveredToWarehouse =
    (token: string, id: string) => groupOrderAction(token, id, 'delivered-to-warehouse');