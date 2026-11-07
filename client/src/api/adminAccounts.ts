// API client for the system admin's "reset another Admin's password" feature.
// Both endpoints are restricted to the dedicated 'systemadmin' account (SystemAdmin policy).

export interface AdminAccount {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
}

export interface ResetAdminPasswordRequest {
    newPassword: string;
    confirmNewPassword: string;
}

export class AdminAccountApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly errors?: Record<string, string[]>,
    ) {
        super(message);
        this.name = 'AdminAccountApiError';
    }
}

async function ensureOk(response: Response): Promise<void> {
    if (response.ok) return;
    const body = await response.json().catch(() => null);
    throw new AdminAccountApiError(
        response.status,
        body?.title ?? `Request failed with status ${response.status}`,
        body?.errors,
    );
}

export async function fetchAdminAccounts(token: string): Promise<AdminAccount[]> {
    const res = await fetch('/api/adminaccounts', {
        headers: { Authorization: `Bearer ${token}` },
    });
    await ensureOk(res);
    return res.json() as Promise<AdminAccount[]>;
}

/** Force-resets an Admin's password (no old password). Their sessions are signed out. */
export async function resetAdminPassword(
    id: string,
    data: ResetAdminPasswordRequest,
    token: string,
): Promise<void> {
    const res = await fetch(`/api/adminaccounts/${id}/password`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    await ensureOk(res);
}
