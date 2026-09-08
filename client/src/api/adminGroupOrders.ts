import type { PagedResult } from '../types/paging';
import type { CustomerSpecialPrice } from './customers';

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
    /** Exact pickup coordinates from the customer's saved map pin. Present on the courier
     *  my-pickups feed; absent on the admin group-order lists. */
    pickUpLatitude?: number | null;
    pickUpLongitude?: number | null;
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
    /** Per-district price exceptions on top of the tiers above (empty when none). */
    customerSpecialPrices: CustomerSpecialPrice[];
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

/** Admin: download an Excel of packages matching the given filters, or just the selected
 *  `ids`. Mirrors the Packages page's filters server-side; triggers a browser file save. */
export async function exportGroupOrdersExcel(
    token: string,
    params: FetchGroupOrdersParams & { ids?: string[]; lang?: 'ka' | 'en' } = {},
): Promise<void> {
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
    if (params.customerId)                    qs.set('customerId', params.customerId);
    if (params.ids && params.ids.length)      qs.set('ids', params.ids.join(','));
    if (params.lang)                          qs.set('lang', params.lang);

    const res = await fetch(`${BASE}/export?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.title ?? `Export failed (${res.status})`);
    }
    const blob        = await res.blob();
    const url         = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match       = /filename[^;=\n]*=(['"]?)([^;"'\n]*)\1/.exec(disposition);
    const filename    = match?.[2]?.trim() || 'packages.xlsx';
    const anchor      = document.createElement('a');
    anchor.href       = url;
    anchor.download   = filename;
    anchor.click();
    URL.revokeObjectURL(url);
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

// ── Soft delete (admin "Delete Package" page) ────────────────────────────────

async function sendDelete(token: string, url: string): Promise<void> {
    const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    // 404 = the row is already gone (stale search result / double click) — treat as done.
    if (!res.ok && res.status !== 404) {
        const err = await res.json().catch(() => ({ title: 'Delete failed' }));
        throw new Error(err.title ?? 'Delete failed');
    }
}

/** Soft-deletes a whole batch and every child package. Hidden from every view; irreversible. */
export const softDeleteGroupOrder = (token: string, id: string) =>
    sendDelete(token, `${BASE}/${id}`);

/** Soft-deletes a single package. Hidden from every view; irreversible. If it was the last
 *  live package in its batch the batch disappears too. */
export const softDeleteOrder = (token: string, id: string) =>
    sendDelete(token, `/api/orders/${id}`);

export interface BulkSoftDeleteResult {
    deletedOrders: number;
    deletedBatches: number;
    notFound: string[];
}

/** Soft-deletes many packages in one request (multi-select). Batches left with no live
 *  package are hidden too. Unknown/already-gone ids come back in `notFound`. */
export async function bulkSoftDeleteOrders(token: string, orderIds: string[]): Promise<BulkSoftDeleteResult> {
    const res = await fetch('/api/orders/bulk-delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Delete failed' }));
        throw new Error(err.title ?? 'Delete failed');
    }
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
/** Undo an accidental Accept — only while still AcceptedGroupOrder (no courier assigned yet). */
export const revertGroupOrderToPending = (token: string, id: string) => groupOrderAction(token, id, 'revert-to-pending');
/** Accept a batch in warehouse. Pass `presentOrderIds` to accept only the packages that
 *  physically arrived; the rest are cancelled as "not received". Omit it to accept all. */
export const acceptGroupOrderInWarehouse = (token: string, id: string, presentOrderIds?: string[]) =>
    groupOrderAction(token, id, 'accept-in-warehouse', presentOrderIds ? { presentOrderIds } : undefined);
export const cancelGroupOrderByAdmin  = (token: string, id: string) => groupOrderAction(token, id, 'cancel-by-admin');
export const setGroupOrderPickupDate  = (token: string, id: string, pickupDate: string) =>
    groupOrderAction(token, id, 'pickup-date', { pickupDate });

export const assignCourierToGroupOrder = (token: string, id: string, courierId: string) =>
    groupOrderAction(token, id, 'assign-courier', { courierId });

export interface BulkAssignCourierResult {
    succeeded: string[];
    failed: { groupOrderId: string; error: string }[];
}

/** Pickup-leg mirror of orders.ts's bulkAssignCourierToOrders — (re)assigns many batches
 *  to one pickup courier in a single request. */
export async function bulkAssignCourierToGroupOrders(
    token: string, groupOrderIds: string[], courierId: string,
): Promise<BulkAssignCourierResult> {
    const res = await fetch(`${BASE}/bulk-assign-courier`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupOrderIds, courierId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Unknown error' }));
        throw new Error(err.title ?? 'Request failed');
    }
    return res.json();
}

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

// ── Admin "Add Package" — office walk-in customer ──────────────────────────────

/** One package row in the Add Package modal. Maps to the backend OrderItemRequest. */
export interface WalkInPackageInput {
    orderType: OrderType;
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description: string | null;
    isFragile: boolean;
    productPaymentStatus: PaymentStatus;
    whoPaysForCompanyService: ServicePayer;
    amountToCollectForPackage: number | null;
    companyServicePrice: number;
    isCompanyServicePriceIncluded: boolean;
    /** Return orders only — where the courier collects the parcel. */
    returnPickupCity: string | null;
    returnPickupDistrict: string | null;
    returnPickupAddress: string | null;
}

/** Typed details for a walk-in customer with no account. */
export interface WalkInCustomerInput {
    firstName: string;
    lastName: string;
    idNumber: string;
    businessName: string;
    phoneNumber: string;
    city: string;
    district: string;
    address: string;
}

export interface CreateWalkInOrderRequest {
    /** Set when the admin picked a suggested existing customer. */
    existingCustomerId: string | null;
    /** Set when the admin typed the details manually. Exactly one of the two is non-null. */
    newCustomer: WalkInCustomerInput | null;
    orders: WalkInPackageInput[];
}

export interface CreateWalkInOrderResult {
    groupOrderId: string;
    senderBusinessName: string;
    orders: { orderId: string; trackingNumber: string; recipientName: string }[];
}

export class WalkInOrderError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly errors?: Record<string, string[]>,
    ) { super(message); this.name = 'WalkInOrderError'; }
}

/** Admin/Operator: register packages for an office walk-in customer (resolves or creates the
 *  customer, then creates the packages straight into the warehouse-accepted state). */
export async function createWalkInOrder(
    token: string, data: CreateWalkInOrderRequest,
): Promise<CreateWalkInOrderResult> {
    const res = await fetch(`${BASE}/walk-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new WalkInOrderError(res.status, body?.title ?? `Request failed (${res.status})`, body?.errors);
    }
    return res.json();
}


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