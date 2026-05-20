import type { OrderStatus, PaymentStatus, ServicePayer } from './adminGroupOrders';

const BASE = '/api/orders';

export type PostponeReason =
    | 'RecipientDidNotAnswer'
    | 'WrongRecipientPhoneNumber'
    | 'RecipientNotAtAddress'
    | 'RecipientRequestedReschedule'
    | 'AddressNotFound'
    | 'InsufficientAccessToBuilding';

export const POSTPONE_REASON_LABELS: Record<PostponeReason, string> = {
    RecipientDidNotAnswer:         'Recipient did not answer',
    WrongRecipientPhoneNumber:     'Wrong recipient phone number',
    RecipientNotAtAddress:         'Recipient is not at the address',
    RecipientRequestedReschedule:  'Recipient requested a reschedule',
    AddressNotFound:               'Address could not be found',
    InsufficientAccessToBuilding:  'Insufficient access to the building',
};

export interface CourierOrder {
    id: string;
    trackingNumber: string;
    senderBusinessName: string | null;
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
    /**
     * Cash amount the courier must collect from the recipient (COD).
     * Only present when productPaymentStatus === 'NotPaid' AND whoPaysForCompanyService === 'Recipient'.
     */
    amountToCollectForPackage: number | null;
    /** The company courier service fee. Used when whoPaysForCompanyService === 'Recipient'. */
    companyServicePrice: number;
    createdAt: string;
    pickedUpFromWarehouseAt: string | null;
    deliveredAt: string | null;
    deliveryDateFrom: string | null;
    deliveryDateTo: string | null;
    postponeReason: PostponeReason | null;
    postponedAt: string | null;
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
export const sendOrderToCity        = (token: string, id: string) => orderAction(token, id, 'send-to-city');
export const assignCourierToOrder   = (token: string, id: string, courierId: string) =>
    orderAction(token, id, 'assign-courier', { courierId });
export const cancelOrderByAdmin     = (token: string, id: string) => orderAction(token, id, 'cancel-by-admin');
export const setCourierSalary       = (token: string, id: string, salary: number) =>
    orderAction(token, id, 'courier-salary', { salary });
export const setCompanyServicePrice = (token: string, id: string, price: number) =>
    orderAction(token, id, 'company-service-price', { price });

// ── Courier ───────────────────────────────────────────────────────────────────
export const markOrderDelivering = (token: string, id: string) => orderAction(token, id, 'delivering');
export const markOrderDelivered  = (token: string, id: string) => orderAction(token, id, 'delivered');
export const postponeOrder       = (token: string, id: string, reason: PostponeReason) =>
    orderAction(token, id, 'postpone', { reason });
export const retryDelivery       = (token: string, id: string) => orderAction(token, id, 'retry-delivery');

export async function fetchMyDeliveries(token: string): Promise<CourierOrder[]> {
    const res = await fetch(`${BASE}/my-deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch deliveries');
    return res.json();
}

export interface CourierOrderHistory {
    id: string;
    recipientFirstName: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description: string | null;
    isFragile: boolean;
    status: OrderStatus;
    createdAt: string;
    deliveredAt: string | null;
}

export async function fetchMyDeliveryHistory(token: string): Promise<CourierOrderHistory[]> {
    const res = await fetch(`${BASE}/my-history`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch delivery history');
    return res.json();
}