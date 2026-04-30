import type { OrderStatus, PaymentStatus, ServicePayer } from './adminGroupOrders';

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
    isFragile: boolean;
    status: OrderStatus;
    productPaymentStatus: PaymentStatus;
    whoPaysForCompanyService: ServicePayer;
    createdAt: string;
    pickedUpFromWarehouseAt: string | null;
    deliveredAt: string | null;
    deliveryDateFrom: string | null;
    deliveryDateTo: string | null;
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

// ── Admin ─────────────────────────────────────────────────────────────────────
export const sendOrderToCity     = (token: string, id: string) => orderAction(token, id, 'send-to-city');
export const assignCourierToOrder = (token: string, id: string, courierId: string) =>
    orderAction(token, id, 'assign-courier', { courierId });
export const cancelOrderByAdmin  = (token: string, id: string) => orderAction(token, id, 'cancel-by-admin');
export const setCourierSalary    = (token: string, id: string, salary: number) =>
    orderAction(token, id, 'courier-salary', { salary });
export const setCompanyServicePrice = (token: string, id: string, price: number) =>
    orderAction(token, id, 'company-service-price', { price });

// ── Courier ───────────────────────────────────────────────────────────────────
// NOTE: markOrderDelivering removed — courier goes directly from received → delivered
export const markOrderReceived  = (token: string, id: string) => orderAction(token, id, 'received');
export const markOrderDelivered = (token: string, id: string) => orderAction(token, id, 'delivered');

export async function fetchMyDeliveries(token: string): Promise<CourierOrder[]> {
    const res = await fetch(`${BASE}/my-deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch deliveries');
    return res.json();
}
