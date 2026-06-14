export interface CreateCourierRequest {
    firstName: string;
    lastName: string;
    idNumber: string;
    phoneNumber: string;
    assignedCity: string;
    assignedDistrict: string;
    username: string;
    password: string;
}

export interface CreateCourierResponse {
    courierId: string;
    username: string;
    fullName: string;
}

/// Full courier record as returned by GET /api/couriers
export interface Courier {
    courierId: string;
    fullName: string;
    username: string;
    assignedCity: string;
    assignedDistrict: string;
    phoneNumber: string;
    idNumber: string;
    isDeleted: boolean;
    dateDeleted: string | null;
}

export interface CourierOrder {
    id: string;
    trackingNumber: string;
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

/// Fetches every order assigned to a courier within [from, to) — delivered or not.
/// `from`/`to` are the UTC bounds of the admin's chosen local calendar day.
export async function fetchAssignedForRange(
    from: Date,
    to: Date,
    token: string,
): Promise<CourierDayDelivery[]> {
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
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

/// Fetches every group-order pickup collected (PickedUpAt) within [from, to),
/// each tagged with its pickup courier. `from`/`to` are the UTC bounds of the chosen day.
export async function fetchAssignedPickupsForRange(
    from: Date,
    to: Date,
    token: string,
): Promise<CourierDayPickup[]> {
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    const res = await fetch(`/api/couriers/assigned-pickups?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch assigned pickups');
    return res.json();
}

export interface UpdateCourierRequest {
    username: string;
    newPassword?: string;
    phoneNumber: string;
    idNumber: string;
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
