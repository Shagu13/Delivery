const BASE = '/api/orders';

export type ReturnExchangeStatus =
    | 'Pending'
    | 'CourierAssignedToPickUp'
    | 'PickedUpFromRecipient'
    | 'DeliveredReturnOrderToWarehouse'
    | 'ReturnedToSender'
    | 'CourierAssignedToDeliver'
    | 'CourierDeliveringTheOrderToRecipient'
    | 'DeliveredToRecipient'
    | 'ExchangeCompleted'
    | 'CancelledByAdmin';

export interface ReturnExchangeOrder {
    id: string;
    trackingNumber: string;
    orderType: 'Return' | 'Exchange';
    status: ReturnExchangeStatus;
    senderName: string;
    senderPhone: string;
    customerId: string | null;
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    returnPickupCity: string | null;
    returnPickupDistrict: string | null;
    returnPickupAddress: string | null;
    courierId: string | null;
    courierFullName: string | null;
    courierPhone: string | null;
    companyServicePrice: number;
    courierSalary: number | null;
    createdAt: string;
    pickedUpFromRecipientAt: string | null;
    deliveredToWarehouseAt: string | null;
    deliveredAt: string | null;
}

export async function fetchReturnExchangeOrders(token: string): Promise<ReturnExchangeOrder[]> {
    const res = await fetch(`${BASE}/return-exchange`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch return/exchange orders');
    return res.json();
}

export async function assignReturnCourier(token: string, orderId: string, courierId: string): Promise<void> {
    const res = await fetch(`${BASE}/${orderId}/assign-return-courier`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courierId }),
    });
    if (!res.ok) throw new Error('Failed to assign courier');
}

export async function markReturnedToSender(token: string, orderId: string): Promise<void> {
    const res = await fetch(`${BASE}/${orderId}/mark-returned-to-sender`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to mark returned to sender');
}

// Courier actions
export async function markReturnPickedUp(token: string, orderId: string): Promise<void> {
    const res = await fetch(`${BASE}/${orderId}/return-picked-up`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to mark return picked up');
}

export async function markReturnDeliveredToWarehouse(token: string, orderId: string): Promise<void> {
    const res = await fetch(`${BASE}/${orderId}/return-delivered-warehouse`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to mark return delivered to warehouse');
}

// Badge count: Return orders not yet ReturnedToSender + Exchange orders not yet completed
export function getPendingReturnExchangeCount(orders: ReturnExchangeOrder[]): number {
    return orders.filter(o => {
        if (o.orderType === 'Return') {
            return o.status !== 'ReturnedToSender' && o.status !== 'CancelledByAdmin';
        }
        // Exchange
        return o.status !== 'ExchangeCompleted' && o.status !== 'DeliveredToRecipient'
            && o.status !== 'ReturnedToSender' && o.status !== 'CancelledByAdmin';
    }).length;
}
