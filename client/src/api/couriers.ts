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
    recipientFirstName: string;
    recipientLastName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    status: string;
    companyServicePrice: number;
    courierSalary: number | null;
    companyRevenue: number | null;
    deliveredAt: string | null;
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

export async function setCourierSalary(orderId: string, salary: number, token: string): Promise<void> {
    const res = await fetch(`/api/orders/${orderId}/courier-salary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ salary }),
    });
    if (!res.ok) throw new Error('Failed to set courier salary');
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
