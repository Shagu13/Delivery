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

async function orderAction(id: string, action: string, body?: object): Promise<void> {
  const res = await fetch(`${BASE}/${id}/${action}`, {
    method: 'PUT',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: 'Unknown error' }));
    throw new Error(err.title ?? 'Request failed');
  }
}

// Admin
export const sendOrderToCity       = (id: string)                    => orderAction(id, 'send-to-city');
export const assignCourierToOrder  = (id: string, courierId: string) => orderAction(id, 'assign-courier', { courierId });

// Courier
export const markOrderReceived   = (id: string) => orderAction(id, 'received');
export const markOrderDelivering = (id: string) => orderAction(id, 'delivering');
export const markOrderDelivered  = (id: string) => orderAction(id, 'delivered');

export async function fetchMyDeliveries(): Promise<CourierOrder[]> {
  const res = await fetch(`${BASE}/my-deliveries`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch deliveries');
  return res.json();
}
