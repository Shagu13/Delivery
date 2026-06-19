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
    | 'CourierDeliveringTheOrderToRecipient'
    | 'DeliveredToRecipient'
    | 'DeliveryPostponed'
    | 'CancelledBySender'
    | 'CancelledByAdmin'
    | 'AllDelivered'
    | 'ReturnedToSender'
    | 'ExchangeCompleted'
    | 'PickedUpFromRecipient'
    | 'DeliveredReturnOrderToWarehouse';

export type PaymentStatus = 'Paid' | 'NotPaid';
export type ServicePayer  = 'Sender' | 'Recipient';
export type OrderType     = 'Send' | 'Return' | 'Exchange';

export interface AdminOrder {
    id: string;
    trackingNumber: string;
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientCityGeo?: string;
    recipientDistrict: string;
    recipientDistrictGeo?: string;
    recipientAddress: string;
    description: string | null;
    isFragile: boolean;
    orderType: OrderType;
    returnPickupAddress?: string | null;
    returnPickupCity?: string | null;
    returnPickupDistrict?: string | null;
    status: OrderStatus;
    productPaymentStatus: PaymentStatus;
    whoPaysForCompanyService: ServicePayer;
    amountToCollectForPackage: number | null;
    amountOfCashCollected: number | null;
    companyServicePrice: number;
    isCompanyServicePriceIncluded: boolean;
    courierSalary: number | null;
    companyRevenue: number | null;
    courierId: string | null;
    createdAt: string;
    deliveryDateFrom: string | null;
    deliveryDateTo: string | null;
    deliveredAt: string | null;
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
    alternativeSenderPhone?: string | null;
    pickUpCity: string;
    pickUpCityGeo?: string;
    pickUpDistrict: string;
    pickUpDistrictGeo?: string;
    pickUpAddress: string;
    note: string | null;
    numberOfPackages: number;
    whenPackagePickedUpDate: string | null;
    courierId: string | null;
    courierFullName: string | null;
    // Customer-specific service pricing (null when no linked customer / tier unset).
    companyServiceCapitalPrice: number | null;
    companyServiceCityPrice: number | null;
    companyServiceDistrictPrice: number | null;
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

export const acceptGroupOrder         = (token: string, id: string) => groupOrderAction(token, id, 'accept');
export const declineGroupOrder        = (token: string, id: string) => groupOrderAction(token, id, 'decline');
export const acceptGroupOrderInWarehouse = (token: string, id: string) => groupOrderAction(token, id, 'accept-in-warehouse');
export const cancelGroupOrderByAdmin  = (token: string, id: string) => groupOrderAction(token, id, 'cancel-by-admin');
export const setGroupOrderPickupDate  = (token: string, id: string, pickupDate: string) =>
    groupOrderAction(token, id, 'pickup-date', { pickupDate });

export const assignCourierToGroupOrder = (token: string, id: string, courierId: string) =>
    groupOrderAction(token, id, 'assign-courier', { courierId });

export const markPickingUp = (token: string, id: string) => groupOrderAction(token, id, 'picking-up');
export const markPickedUp = (token: string, id: string) => groupOrderAction(token, id, 'picked-up');
export const markDeliveredToWarehouse = (token: string, id: string) => groupOrderAction(token, id, 'delivered-to-warehouse');


export interface CourierPickupHistory {
    id: string;
    senderFirstName: string;
    senderLastName: string;
    senderBusinessName: string;
    pickUpCity: string;
    pickUpDistrict: string;
    pickUpAddress: string;
    note: string | null;
    numberOfPackages: number;
    status: OrderStatus;
    createdAt: string;
    pickedUpAt: string | null;
    deliveredToWarehouseAt: string | null;
}

export async function fetchMyPickupHistory(token: string): Promise<CourierPickupHistory[]> {
    const res = await fetch(`${BASE}/my-pickup-history`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch pickup history');
    return res.json();
}