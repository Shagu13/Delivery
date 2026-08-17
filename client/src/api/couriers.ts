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
/// day ("YYYY-MM-DD"). For today the backend returns everything each courier
/// currently holds plus what they closed today; for a past day, only what they
/// completed that day.
export async function fetchAssignedForDay(
    dayKey: string,
    token: string,
): Promise<CourierDayDelivery[]> {
    const qs = new URLSearchParams({ date: dayKey });
    const res = await fetch(`/api/couriers/assigned?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch assigned orders');
    return res.json();
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
