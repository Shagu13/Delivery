import type { PagedResult } from '../types/paging';

const BASE = '/api/grouporders';

export type OrderStatus =
    | 'Pending'
    | 'AcceptedGroupOrder'
    | 'AcceptedOrder'
    | 'OrderNotAccepted'
    | 'CourierAssignedToPickUp'
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
    cancellationReason?: 'DidNotLike' | 'DidNotWant' | 'WrongSize' | 'Other' | 'WarehouseNotReceived' | null;
    cancellationComment?: string | null;
    /** Set once an admin marked this cancelled order as physically returned to the sender. */
    cancelledReturnedToSenderAt?: string | null;
}

export interface AdminGroupOrder {
    id: string;
    createdAt: string;
    status: OrderStatus;
    /** Customer link (null for legacy/guest batches). Used to unite a customer's same-day batches. */
    customerId: string | null;
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
    /** Actual pickup / warehouse-drop timestamps (null until they happen). */
    pickedUpAt?: string | null;
    deliveredToWarehouseAt?: string | null;
    courierId: string | null;
    courierFullName: string | null;
    // Customer-specific service pricing (null when no linked customer / tier unset).
    companyServiceCapitalPrice: number | null;
    companyServiceCityPrice: number | null;
    companyServiceDistrictPrice: number | null;
    orders: AdminOrder[];
    /** True for a synthetic single-order "batch" wrapping a standalone order
     *  (GroupOrderId == null). Rendered like a batch but with a Group action. */
    isStandalone?: boolean;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export interface FetchGroupOrdersParams {
    search?: string;
    /** Range start (Georgian day). Omit with dateTo omitted → no date bound (whole DB). */
    date?: string;
    /** Range end (inclusive). Omit → single day = date. */
    dateTo?: string;
    /** Pickup cities (party='sender', default) or recipient cities (party='recipient'); any match. */
    cities?: string[];
    /** Pickup districts (party='sender', default) or recipient districts (party='recipient'); any match. */
    districts?: string[];
    party?: 'sender' | 'recipient';
    status?: string;
    /** Delivery courier (last-mile Order.CourierId) — matches any child order. */
    courierId?: string;
    /** Missing financials — matches any child order with no company service price or no
     *  courier salary set. */
    unpriced?: boolean;
    /** Hide fully completed batches/orders (they live in History). Default false. */
    excludeCompleted?: boolean;
    page?: number;
    pageSize?: number;
    /** Owning customer — GroupOrder.CustomerId for batches, Order.CustomerId for standalone
     *  orders (History page's customer filter). */
    customerId?: string;
}

export async function fetchGroupOrders(token: string, params: FetchGroupOrdersParams = {}): Promise<PagedResult<AdminGroupOrder>> {
    const qs = new URLSearchParams();
    if (params.search)                        qs.set('search', params.search);
    if (params.date)                          qs.set('date', params.date);
    if (params.dateTo)                        qs.set('dateTo', params.dateTo);
    if (params.cities && params.cities.length > 0)       qs.set('city', params.cities.join(','));
    if (params.districts && params.districts.length > 0) qs.set('district', params.districts.join(','));
    if (params.party)                         qs.set('party', params.party);
    if (params.status)                        qs.set('status', params.status);
    if (params.courierId)                     qs.set('courierId', params.courierId);
    if (params.unpriced)                      qs.set('unpriced', 'true');
    if (params.excludeCompleted)              qs.set('excludeCompleted', 'true');
    if (params.page)                          qs.set('page', String(params.page));
    if (params.pageSize)                      qs.set('pageSize', String(params.pageSize));
    if (params.customerId)                    qs.set('customerId', params.customerId);
    const qsStr = qs.toString();
    const res = await fetch(qsStr ? `${BASE}?${qsStr}` : BASE, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch group orders');
    return res.json();
}

/** A distinct pickup city + district pair that appears in GroupOrders (sender/pickup side). */
export interface GroupOrderLocation {
    city: string;
    cityGeo?: string | null;
    district: string;
    districtGeo?: string | null;
}

/** Admin/Operator/TenantAdmin: distinct pickup city/district pairs — drives the Packages page's
 *  City/District filter (sender party) so its option list is complete across the whole DB, not
 *  just the currently loaded page. Optionally scoped to a Georgian day/range. */
export async function fetchGroupOrderLocations(token: string, date?: string, dateTo?: string): Promise<GroupOrderLocation[]> {
    const qs = new URLSearchParams();
    if (date)   qs.set('date', date);
    if (dateTo) qs.set('dateTo', dateTo);
    const res = await fetch(`${BASE}/pickup-locations${qs.toString() ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch pickup locations');
    return res.json();
}

// ── Pick-Up day summary + grouping (admin) ──────────────────────────────────────

export interface PickupDayCustomer {
    customerId: string;
    businessName: string;
    ordersPlaced: number;
    unattachedOrders: number;
}

/** Per-customer order/unattached counts for a given day (YYYY-MM-DD). */
export async function fetchPickupDay(token: string, date: string): Promise<PickupDayCustomer[]> {
    const res = await fetch(`${BASE}/pickup-day?date=${encodeURIComponent(date)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch pickup day');
    return res.json();
}

/** A customer's still-unattached orders for a given day, for the grouping modal. */
export async function fetchCustomerUnattached(
    token: string, customerId: string, date: string,
): Promise<AdminOrder[]> {
    const res = await fetch(
        `${BASE}/customer-unattached?customerId=${encodeURIComponent(customerId)}&date=${encodeURIComponent(date)}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error('Failed to fetch unattached orders');
    return res.json();
}

/**
 * Links the chosen unattached orders to a batch. Pass targetGroupOrderId to append to a
 * specific existing batch; omit it to reuse the customer's open same-day batch or create one.
 */
export async function attachOrdersToGroup(
    token: string, customerId: string, date: string, orderIds: string[],
    targetGroupOrderId?: string,
): Promise<void> {
    const res = await fetch(`${BASE}/attach`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, date, orderIds, targetGroupOrderId: targetGroupOrderId ?? null }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Request failed' }));
        throw new Error(err.title ?? 'Request failed');
    }
}

/** Moves a single order from its current batch into another batch of the same customer. */
export async function moveOrderToGroup(
    token: string, orderId: string, targetGroupOrderId: string,
): Promise<void> {
    const res = await fetch(`${BASE}/move-order`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, targetGroupOrderId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Request failed' }));
        throw new Error(err.title ?? 'Request failed');
    }
}

/** Merges the chosen source batches into the target batch. */
export async function mergeGroupOrders(
    token: string, targetGroupOrderId: string, sourceGroupOrderIds: string[],
): Promise<void> {
    const res = await fetch(`${BASE}/merge`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGroupOrderId, sourceGroupOrderIds }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Request failed' }));
        throw new Error(err.title ?? 'Request failed');
    }
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
/** Accept a batch in warehouse. Pass `presentOrderIds` to accept only the packages that
 *  physically arrived; the rest are cancelled as "not received". Omit it to accept all. */
export const acceptGroupOrderInWarehouse = (token: string, id: string, presentOrderIds?: string[]) =>
    groupOrderAction(token, id, 'accept-in-warehouse', presentOrderIds ? { presentOrderIds } : undefined);
export const cancelGroupOrderByAdmin  = (token: string, id: string) => groupOrderAction(token, id, 'cancel-by-admin');
export const setGroupOrderPickupDate  = (token: string, id: string, pickupDate: string) =>
    groupOrderAction(token, id, 'pickup-date', { pickupDate });

export const assignCourierToGroupOrder = (token: string, id: string, courierId: string) =>
    groupOrderAction(token, id, 'assign-courier', { courierId });

/** Group a standalone order (no batch) into a batch and accept it, in one step.
 *  `orderId` is the standalone Order's id. Pass `targetGroupOrderId` to merge into a
 *  specific existing batch; omit it to create a new batch. */
export async function groupAndAcceptStandalone(
    token: string, orderId: string, targetGroupOrderId?: string,
): Promise<void> {
    const q = targetGroupOrderId ? `?targetGroupOrderId=${targetGroupOrderId}` : '';
    const res = await fetch(`${BASE}/standalone/${orderId}/group-and-accept${q}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Request failed' }));
        throw new Error(err.title ?? 'Request failed');
    }
}

/** Group a standalone order into a batch (chosen or new), record the pickup courier on
 *  the batch, and mark it in the warehouse — in one step. `orderId` is the Order's id. */
export async function groupAndWarehouseStandalone(
    token: string, orderId: string, opts: { targetGroupOrderId?: string; courierId?: string },
): Promise<void> {
    const params = new URLSearchParams();
    if (opts.targetGroupOrderId) params.set('targetGroupOrderId', opts.targetGroupOrderId);
    if (opts.courierId)          params.set('courierId', opts.courierId);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`${BASE}/standalone/${orderId}/group-and-warehouse${q}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Request failed' }));
        throw new Error(err.title ?? 'Request failed');
    }
}

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