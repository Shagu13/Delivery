export interface CreateCourierRequest {
    firstName: string;
    lastName: string;
    idNumber: string;
    phoneNumber: string;
    assignedCity: string;
    assignedDistrict: string;
    username: string;
    password: string;
    /** Standard per-order delivery salary — only allowed when assignedCity is Tbilisi. */
    defaultSalary?: number | null;
}

export interface CreateCourierResponse {
    courierId: string;
    username: string;
    fullName: string;
}

/// Full courier record as returned by GET /api/couriers
export interface Courier {
    courierId: string;
    firstName: string;
    lastName: string;
    fullName: string;
    username: string;
    assignedCity: string;
    assignedDistrict: string;
    phoneNumber: string;
    idNumber: string;
    isDeleted: boolean;
    dateDeleted: string | null;
    /** Standard per-order delivery salary — only set for Tbilisi couriers; null elsewhere. */
    defaultSalary: number | null;
}

export interface CourierOrder {
    id: string;
    trackingNumber: string;
    /** Owning store (sender) business name — shown on the Admin Couriers delivery view. */
    senderBusinessName: string;
    recipientName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    status: string;
    companyServicePrice: number;
    amountToCollectForPackage: number | null;
    courierSalary: number | null;
    companyRevenue: number | null;
    orderType: string;
    assignedToCourierAt: string | null;
    deliveredAt: string | null;
    deliveredToWarehouseAt: string | null;
    createdAt: string;
}

export class CourierApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly errors?: Record<string, string[]>,
    ) {
        super(message);
        this.name = 'CourierApiError';
    }
}

export async function createCourier(
    data: CreateCourierRequest,
    token: string,
): Promise<CreateCourierResponse> {
    const response = await fetch('/api/couriers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new CourierApiError(
            response.status,
            body?.title ?? `Request failed with status ${response.status}`,
            body?.errors,
        );
    }

    return response.json() as Promise<CreateCourierResponse>;
}

export async function fetchCouriers(token: string): Promise<Courier[]> {
    const res = await fetch('/api/couriers', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch couriers');
    return res.json();
}

export async function fetchCourierOrders(courierId: string, token: string): Promise<CourierOrder[]> {
    const res = await fetch(`/api/couriers/${courierId}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch courier orders');
    return res.json();
}

/// A delivery within a day window, tagged with the courier who delivered it.
export interface CourierDayDelivery extends CourierOrder {
    courierId: string;
}

/// Fetches a day's last-mile workload per courier. `dayKey` is a Georgian calendar
/// day ("YYYY-MM-DD"). Filtered by when the order was assigned to its courier
/// (AssignedToCourierAt), not by delivery/completion time.
export async function fetchAssignedForDay(
    dayKey: string,
    token: string,
    includePrevious = true,
): Promise<CourierDayDelivery[]> {
    const qs = new URLSearchParams({ date: dayKey, includePrevious: String(includePrevious) });
    const res = await fetch(`/api/couriers/assigned?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch assigned orders');
    return res.json();
}

/// Downloads an Excel manifest of one courier's orders assigned on `dayKey` (same day
/// filter as `fetchAssignedForDay`). Same column layout as the Packages page's export
/// (Date, Sender, City, Address, Recipient, Description, Phone, COD, Service Fee).
/// Triggers a browser file save.
export async function exportAssignedForCourierExcel(
    dayKey: string,
    courierId: string,
    token: string,
    lang: 'ka' | 'en' = 'ka',
    includePrevious = true,
): Promise<void> {
    const qs = new URLSearchParams({ date: dayKey, courierId, lang, includePrevious: String(includePrevious) });
    const res = await fetch(`/api/couriers/assigned/export?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.title ?? `Export failed (${res.status})`);
    }
    await saveResponseAsFile(res, 'courier-orders.xlsx');
}

/// Saves a file response through the browser, taking the name from its Content-Disposition.
async function saveResponseAsFile(res: Response, fallbackName: string): Promise<void> {
    const blob        = await res.blob();
    const url         = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    // Non-ASCII (Georgian) names arrive as RFC 5987 `filename*=UTF-8''<percent-encoded>`,
    // alongside an ASCII-safe `filename="___ ___"` fallback the server sends for older
    // clients — that fallback appears first in the header, so it must be checked second
    // here or the courier's real name never makes it into the saved file.
    const starMatch = /filename\*=UTF-8''([^;\n]*)/i.exec(disposition);
    const plainMatch = /filename=(['"]?)([^;"'\n]*)\1/i.exec(disposition);
    const filename = starMatch
        ? decodeURIComponent(starMatch[1].trim())
        : plainMatch?.[2]?.trim() || fallbackName;
    const anchor      = document.createElement('a');
    anchor.href       = url;
    anchor.download   = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

/// A group-order pickup actually collected by a courier, tagged with the courier's id.
export interface CourierDayPickup {
    courierId: string;
    id: string;
    senderBusinessName: string;
    senderPhone: string;
    pickUpCity: string;
    pickUpDistrict: string;
    pickUpAddress: string;
    numberOfPackages: number;
    status: string;
    pickedUpAt: string | null;
    createdAt: string;
}

/// The pickup-leg mirror of `fetchAssignedForDay`: batches per pickup courier for one
/// Georgian day — today's still-out-on plus collected-today, or a past day's collected.
export async function fetchAssignedPickupsForDay(
    dayKey: string,
    token: string,
): Promise<CourierDayPickup[]> {
    const qs = new URLSearchParams({ date: dayKey });
    const res = await fetch(`/api/couriers/assigned-pickups?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch assigned pickups');
    return res.json();
}

// ── Completed tab: what couriers finished between two Georgian days (inclusive) ──

/// One order a courier finished on the last-mile leg. `TOrder` is the Delivery list's order shape
/// (`AdminOrderItem` + `expectedCourierCash`) — kept generic so this file doesn't import from pages.
export interface CompletedDelivery<TOrder> {
    order: TOrder;
    /// Delivery time, the failed-attempt time, or — for a standalone Return — the warehouse drop-off.
    completedAt: string;
    /// A billable failed delivery: not handed over, but the sender is still charged.
    isFailed: boolean;
    failureReason: string | null;
    failureComment: string | null;
}

/// A pickup batch a courier brought to the warehouse.
export interface CompletedPickup {
    id: string;
    courierId: string;
    courierFullName: string;
    senderBusinessName: string;
    senderPhone: string;
    pickUpCity: string;
    pickUpDistrict: string;
    pickUpAddress: string;
    numberOfPackages: number;
    status: string;
    pickedUpAt: string | null;
    deliveredToWarehouseAt: string;
}

export type CompletedLeg = 'deliveries' | 'pickups';

function completedQuery(courierId: string, fromKey: string, toKey: string, extra: Record<string, string> = {}): string {
    const qs = new URLSearchParams({ from: fromKey, to: toKey, ...extra });
    if (courierId) qs.set('courierId', courierId);
    return qs.toString();
}

/// `courierId` '' = every courier; `fromKey`/`toKey` are Georgian "YYYY-MM-DD" days (equal = a single day).
export async function fetchCompletedDeliveries<TOrder>(
    token: string, courierId: string, fromKey: string, toKey: string,
): Promise<CompletedDelivery<TOrder>[]> {
    const res = await fetch(`/api/couriers/completed/deliveries?${completedQuery(courierId, fromKey, toKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch completed deliveries');
    return res.json();
}

export async function fetchCompletedPickups(
    token: string, courierId: string, fromKey: string, toKey: string,
): Promise<CompletedPickup[]> {
    const res = await fetch(`/api/couriers/completed/pickups?${completedQuery(courierId, fromKey, toKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch completed pickups');
    return res.json();
}

/// Downloads the same filtered list as an Excel file. Triggers a browser file save.
export async function exportCompletedExcel(
    token: string, leg: CompletedLeg, courierId: string, fromKey: string, toKey: string, lang: 'ka' | 'en',
): Promise<void> {
    const res = await fetch(`/api/couriers/completed/${leg}/export?${completedQuery(courierId, fromKey, toKey, { lang })}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.title ?? `Export failed (${res.status})`);
    }
    await saveResponseAsFile(res, `completed-${leg}.xlsx`);
}

export interface UpdateCourierRequest {
    firstName: string;
    lastName: string;
    username: string;
    newPassword?: string;
    phoneNumber: string;
    idNumber: string;
    /** Standard per-order delivery salary — only allowed when the courier is assigned to Tbilisi. */
    defaultSalary?: number | null;
}

export async function updateCourier(
    courierId: string,
    data: UpdateCourierRequest,
    token: string,
): Promise<void> {
    const res = await fetch(`/api/couriers/${courierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CourierApiError(
            res.status,
            body?.title ?? `Request failed with status ${res.status}`,
            body?.errors,
        );
    }
}

export async function setCourierActiveStatus(
    courierId: string,
    isActive: boolean,
    token: string,
): Promise<void> {
    const res = await fetch(`/api/couriers/${courierId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CourierApiError(
            res.status,
            body?.title ?? `Request failed with status ${res.status}`,
        );
    }
}
