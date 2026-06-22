// API client for Operator accounts (back-office staff with partial admin access).
// Mirrors the couriers client. Admin-only endpoints.

export interface Operator {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
}

export interface CreateOperatorRequest {
    firstName: string;
    lastName: string;
    username: string;
    password: string;
}

export interface CreateOperatorResponse {
    id: string;
    username: string;
    fullName: string;
}

export interface UpdateOperatorRequest {
    firstName: string;
    lastName: string;
    username: string;
    newPassword?: string | null;
}

export class OperatorApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly errors?: Record<string, string[]>,
    ) {
        super(message);
        this.name = 'OperatorApiError';
    }
}

async function ensureOk(response: Response): Promise<void> {
    if (response.ok) return;
    const body = await response.json().catch(() => null);
    throw new OperatorApiError(
        response.status,
        body?.title ?? `Request failed with status ${response.status}`,
        body?.errors,
    );
}

export async function fetchOperators(token: string): Promise<Operator[]> {
    const res = await fetch('/api/operators', {
        headers: { Authorization: `Bearer ${token}` },
    });
    await ensureOk(res);
    return res.json() as Promise<Operator[]>;
}

export async function createOperator(
    data: CreateOperatorRequest,
    token: string,
): Promise<CreateOperatorResponse> {
    const res = await fetch('/api/operators', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    await ensureOk(res);
    return res.json() as Promise<CreateOperatorResponse>;
}

export async function updateOperator(
    id: string,
    data: UpdateOperatorRequest,
    token: string,
): Promise<void> {
    const res = await fetch(`/api/operators/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    await ensureOk(res);
}

export async function deleteOperator(id: string, token: string): Promise<void> {
    const res = await fetch(`/api/operators/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    await ensureOk(res);
}
