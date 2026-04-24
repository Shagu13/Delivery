import type { OrderStatus } from './adminGroupOrders';

const BASE = '/api/orders';

export interface CourierOrder {
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
    createdAt: string;
    pickedUpFromWarehouseAt: string | null;
    deliveredAt: string | null;
}

async function orderAction(token: string, id: string, action: string, body?: object): Promise<void> {
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

// Admin
export const sendOrderToCity = (token: string, id: string) => orderAction(token, id, 'send-to-city');
export const assignCourierToOrder = (token: string, id: string, courierId: string) =>
    orderAction(token, id, 'assign-courier', { courierId });

// Courier
export const markOrderReceived = (token: string, id: string) => orderAction(token, id, 'received');
export const markOrderDelivering = (token: string, id: string) => orderAction(token, id, 'delivering');
export const markOrderDelivered = (token: string, id: string) => orderAction(token, id, 'delivered');

export async function fetchMyDeliveries(token: string): Promise<CourierOrder[]> {
    const res = await fetch(`${BASE}/my-deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch deliveries');
    return res.json();
}