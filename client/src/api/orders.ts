import type { OrderStatus, PaymentStatus, ServicePayer } from './adminGroupOrders';

const BASE = '/api/orders';

/** Admin: download an Excel of orders matching the given filters, or just the selected
 *  `ids`. Triggers a browser file save. Mirrors the Delivery page's filters server-side. */
export async function exportOrdersExcel(
    token: string,
    params: {
        city?: string; district?: string; search?: string; courierId?: string;
        unpriced?: boolean; assigned?: boolean; activeOnly?: boolean;
        date?: string; dateTo?: string; ids?: string[];
    },
): Promise<void> {
    const qs = new URLSearchParams();
    if (params.city)      qs.set('city', params.city);
    if (params.district)  qs.set('district', params.district);
    if (params.search)    qs.set('search', params.search);
    if (params.courierId) qs.set('courierId', params.courierId);
    if (params.unpriced)  qs.set('unpriced', 'true');
    if (params.assigned !== undefined) qs.set('assigned', String(params.assigned));
    if (params.activeOnly) qs.set('activeOnly', 'true');
    if (params.date)      qs.set('date', params.date);
    if (params.dateTo)    qs.set('dateTo', params.dateTo);
    if (params.ids && params.ids.length) qs.set('ids', params.ids.join(','));

    const res = await fetch(`${BASE}/export?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.title ?? `Export failed (${res.status})`);
    }
    const blob        = await res.blob();
    const url         = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match       = /filename[^;=\n]*=(['"]?)([^;"'\n]*)\1/.exec(disposition);
    const filename    = match?.[2]?.trim() || 'orders.xlsx';
    const anchor      = document.createElement('a');
    anchor.href       = url;
    anchor.download   = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

/** A past recipient pulled from order history — not a saved entity, just a distinct
 *  (name, phone, city, district, address) combination seen on an earlier package. */
export interface RecipientSuggestion {
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
}

/** Admin/Operator: past recipients from one customer's own order history whose phone
 *  contains the given digits — powers the recipient-autofill dropdown in AddPackageModal.
 *  Never a cross-customer search. */
export async function searchRecipientSuggestions(
    token: string, customerId: string, phone: string,
): Promise<RecipientSuggestion[]> {
    const qs = new URLSearchParams({ customerId, phone });
    const res = await fetch(`${BASE}/recipients/search?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    return res.json();
}

/** Customer: past recipients from the caller's own order history whose phone contains the
 *  given digits — powers the recipient-autofill dropdown on the create-order page. */
export async function searchMyRecipientSuggestions(
    token: string, phone: string,
): Promise<RecipientSuggestion[]> {
    const qs = new URLSearchParams({ phone });
    const res = await fetch(`${BASE}/recipients/my-search?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    return res.json();
}

export type PostponeReason =
    | 'RecipientDidNotAnswer'
    | 'WrongRecipientPhoneNumber'
    | 'RecipientNotAtAddress'
    | 'RecipientRequestedReschedule'
    | 'AddressNotFound'
    | 'Other';

export const POSTPONE_REASON_LABELS: Record<PostponeReason, string> = {
    RecipientDidNotAnswer:         'Recipient did not answer',
    WrongRecipientPhoneNumber:     'Wrong recipient phone number',
    RecipientNotAtAddress:         'Recipient is not at the address',
    RecipientRequestedReschedule:  'Recipient requested a reschedule',
    AddressNotFound:               'Address could not be found',
    Other:                         'Other',
};

export type CancellationReason = 'DidNotLike' | 'DidNotWant' | 'WrongSize' | 'Other';

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
    DidNotLike: 'Did not like',
    DidNotWant: 'Cancelled before arrival',
    WrongSize:  'Wrong size',
    Other:      'Other',
};

/**
 * Cancellation reasons that do NOT bill the sender the company service fee — the order was
 * cancelled before any delivery service was rendered. Mirrors the backend's exclusions in
 * OrderFinance.IsBillableFailedDelivery. Used to colour reason chips green (vs red billable).
 */
export const NON_BILLABLE_CANCEL_REASONS = new Set<string>(['DidNotWant', 'WarehouseNotReceived']);

export interface CourierOrder {
    id: string;
    trackingNumber: string;
    orderType: 'Send' | 'Return' | 'Exchange';
    senderBusinessName: string | null;
    /** The sender's (shop's) phone — sourced the same way as senderBusinessName. */
    senderPhone: string | null;
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    /** Exact coordinates of the delivery/pickup point when the address was geocoded; null otherwise. */
    latitude: number | null;
    longitude: number | null;
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
    /** When this courier was assigned this order — lets the courier see which of their jobs is oldest. */
    assignedToCourierAt: string | null;
    pickedUpFromWarehouseAt: string | null;
    deliveredAt: string | null;
    deliveryDateFrom: string | null;
    deliveryDateTo: string | null;
    returnPickupCity: string | null;
    returnPickupDistrict: string | null;
    returnPickupAddress: string | null;
    postponeReason: PostponeReason | null;
    postponeComment: string | null;
    postponedAt: string | null;
}

export interface UpdateOrderRequest {
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description: string | null;
    isFragile: boolean;
    whoPaysForCompanyService: string;   // "Sender" | "Recipient"
    productPaymentStatus: string;       // "Paid" | "NotPaid"
    amountToCollectForPackage: number | null;
    companyServicePrice: number;
    /** True when amountToCollectForPackage is the all-in price (product + service fee bundled). */
    isCompanyServicePriceIncluded: boolean;
    courierSalary: number | null;
    orderType?: string | null;
    returnPickupCity?: string | null;
    returnPickupDistrict?: string | null;
    returnPickupAddress?: string | null;
    statusOverride?: string | null;
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

export interface BulkAssignCourierResult {
    succeeded: string[];
    failed: { orderId: string; error: string }[];
}

/**
 * Assigns a courier to many orders (Send/Exchange delivery orders and standalone Return
 * pickups may be mixed) in one request — a single DB write and background-fired
 * notifications server-side, instead of one HTTP request per order.
 */
export async function bulkAssignCourierToOrders(
    token: string, orderIds: string[], courierId: string,
): Promise<BulkAssignCourierResult> {
    const res = await fetch(`${BASE}/bulk-assign-courier`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, courierId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Unknown error' }));
        throw new Error(err.title ?? 'Request failed');
    }
    return res.json();
}
/**
 * Admin cancels an order. With no `opts` it is a plain, no-charge cancel. Passing a `reason`
 * makes it a billable "cancel & charge" — the sender is invoiced the service fee and the courier
 * earns salary (the order must have reached a delivery courier), mirroring the courier's own
 * cancel-with-reason.
 */
export const cancelOrderByAdmin          = (
    token: string, id: string, opts?: { reason?: CancellationReason; comment?: string },
) => orderAction(
    token, id, 'cancel-by-admin',
    opts?.reason ? { reason: opts.reason, comment: opts.comment ?? null } : undefined,
);
/**
 * Admin force-marks a Send/Exchange order delivered to recipient. Optionally assigns a
 * courier (only applied when the order has none, so the delivery is attributed for
 * courier settlement) and/or sets the courier salary — both atomic with the delivery.
 */
export const adminMarkOrderDelivered     = (
    token: string, id: string, opts?: { courierId?: string; salary?: number },
) => orderAction(
    token, id, 'admin-mark-delivered',
    opts && (opts.courierId != null || opts.salary != null)
        ? { courierId: opts.courierId ?? null, salary: opts.salary ?? null }
        : undefined,
);
export const adminMarkReturnAtWarehouse  = (token: string, id: string) => orderAction(token, id, 'admin-mark-at-warehouse');
/**
 * Admin marks a Send/Exchange order whose delivery failed (recipient refused) as returned to
 * the sender — Order → ReturnedToSender. The sender still owes the company service fee and the
 * courier still earns salary.
 */
export const markSendReturnedToSender    = (token: string, id: string) => orderAction(token, id, 'mark-send-returned-to-sender');
/**
 * Admin adds a final step onto an already-cancelled Send/Exchange order (cancelled by admin or
 * declined by courier): stamps CancelledReturnedToSenderAt to record the parcel was physically
 * handed back to the sender. Keeps the cancelled status; billing is unchanged.
 */
export const markCancelledReturnedToSender = (token: string, id: string) => orderAction(token, id, 'mark-cancelled-returned-to-sender');
/**
 * Admin corrects a courier's mistaken terminal status, returning the order to the
 * delivery flow (CourierAssignedToDeliver). 'UnCancel' revives a wrongly cancelled
 * order; 'UnDeliver' reverts a wrongly delivered one (clearing its recorded cash/payment).
 */
export const correctOrderStatus     = (token: string, id: string, correction: 'UnCancel' | 'UnDeliver') =>
    orderAction(token, id, 'correct-status', { correction });
export const setCourierSalary       = (token: string, id: string, salary: number) =>
    orderAction(token, id, 'courier-salary', { salary });
export const setCompanyServicePrice = (token: string, id: string, price: number) =>
    orderAction(token, id, 'company-service-price', { price });
/** Admin sets an order's service fee and COD together (Finance price editor). A null COD clears it. */
export const setOrderPrices = (
    token: string, id: string, companyServicePrice: number, amountToCollectForPackage: number | null, customerSurcharge: number,
) => orderAction(token, id, 'prices', { companyServicePrice, amountToCollectForPackage, customerSurcharge });
/** Admin postpones an assigned delivery (mirrors the courier action). Comment is only kept
 *  (and required by the UI) for the "Other" reason. */
export const adminPostponeOrder = (token: string, id: string, reason: PostponeReason, comment?: string) =>
    orderAction(token, id, 'admin-postpone', { reason, comment: comment ?? null });

export async function updateOrder(token: string, id: string, data: UpdateOrderRequest): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ title: 'Unknown error' }));
        throw new Error(err.title ?? 'Update failed');
    }
}

// ── Courier ───────────────────────────────────────────────────────────────────
/** `updatedCodAmount` corrects the parcel COD amount at the door (e.g. the recipient
 *  negotiated a different price than the sender originally set). */
export const markOrderDelivered = (token: string, id: string, updatedCodAmount?: number) =>
    orderAction(token, id, 'delivered', updatedCodAmount != null ? { updatedCodAmount } : undefined);
/** Delivered, but the recipient had already paid the sender directly (COD zeroed). */
export const markOrderDeliveredPaidToSender = (token: string, id: string, serviceFeeAlsoPaidToSender: boolean) =>
    orderAction(token, id, 'delivered-paid-to-sender', { serviceFeeAlsoPaidToSender });
export const postponeOrder       = (token: string, id: string, reason: PostponeReason, comment?: string) =>
    orderAction(token, id, 'postpone', { reason, comment: comment ?? null });
export const cancelDelivery      = (token: string, id: string, reason: CancellationReason, comment?: string) =>
    orderAction(token, id, 'cancel-delivery', { reason, comment: comment ?? null });
export const retryDelivery       = (token: string, id: string) => orderAction(token, id, 'retry-delivery');
export const markReturnPickedUp           = (token: string, id: string) => orderAction(token, id, 'return-picked-up');
export const markReturnDeliveredWarehouse = (token: string, id: string) => orderAction(token, id, 'return-delivered-warehouse');

/** A distinct recipient city + district pair that appears in orders. */
export interface OrderLocation {
    city: string;
    cityGeo?: string | null;
    district: string;
    districtGeo?: string | null;
}

/** Admin/Operator/TenantAdmin: distinct city/district pairs used in orders — drives the
 *  Delivery page City/District filters (only used locations, complete across all pages).
 *  Optionally scoped to a Georgian day (yyyy-MM-dd). */
export async function fetchOrderLocations(token: string, date?: string, dateTo?: string): Promise<OrderLocation[]> {
    const qs = new URLSearchParams();
    if (date)   qs.set('date', date);
    if (dateTo) qs.set('dateTo', dateTo);
    const res = await fetch(`${BASE}/locations${qs.toString() ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch order locations');
    return res.json();
}

export async function fetchMyDeliveries(token: string): Promise<CourierOrder[]> {
    const res = await fetch(`${BASE}/my-deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch deliveries');
    return res.json();
}

/** Standalone Return orders assigned to this courier in pickup-phase statuses — shown on
 *  the Pickups tab (collecting from the recipient), not the Deliveries tab. */
export async function fetchMyReturnPickups(token: string): Promise<CourierOrder[]> {
    const res = await fetch(`${BASE}/my-return-pickups`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch return pickups');
    return res.json();
}

export interface CourierOrderHistory {
    id: string;
    recipientName: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    description: string | null;
    isFragile: boolean;
    status: OrderStatus;
    createdAt: string;
    deliveredAt: string | null;
    cancelledAt: string | null;
    /** The sender's (not recipient's) business name and phone. */
    shopName: string | null;
    shopPhone: string | null;
    /** Cash (COD + recipient-paid fee) the courier collected at the door; 0 unless delivered. */
    collectedAmount: number;
}

export async function fetchMyDeliveryHistory(token: string): Promise<CourierOrderHistory[]> {
    const res = await fetch(`${BASE}/my-history`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch delivery history');
    return res.json();
}
