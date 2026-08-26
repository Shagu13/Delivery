// ── The company's own bank accounts (Admin-managed) ──────────────────────────────

export interface CompanyBankAccount {
    id: string;
    label: string | null;
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
    isDefault: boolean;
}

export interface CompanyBankAccountRequest {
    label?: string | null;
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', ...authHeaders(token) });

async function handle<T>(res: Response, fallback: string): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.title ?? `${fallback} (${res.status})`);
    }
    return res.json() as Promise<T>;
}

export async function fetchCompanyBankAccounts(token: string): Promise<CompanyBankAccount[]> {
    const res = await fetch('/api/companybankaccounts', { headers: authHeaders(token), cache: 'no-store' });
    return handle<CompanyBankAccount[]>(res, 'Failed to load bank accounts');
}

export async function addCompanyBankAccount(
    request: CompanyBankAccountRequest, token: string,
): Promise<CompanyBankAccount[]> {
    const res = await fetch('/api/companybankaccounts', {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(request),
    });
    return handle<CompanyBankAccount[]>(res, 'Failed to add bank account');
}

export async function updateCompanyBankAccount(
    accountId: string, request: CompanyBankAccountRequest, token: string,
): Promise<CompanyBankAccount[]> {
    const res = await fetch(`/api/companybankaccounts/${accountId}`, {
        method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify(request),
    });
    return handle<CompanyBankAccount[]>(res, 'Failed to update bank account');
}

export async function setDefaultCompanyBankAccount(accountId: string, token: string): Promise<CompanyBankAccount[]> {
    const res = await fetch(`/api/companybankaccounts/${accountId}/default`, {
        method: 'PUT', headers: authHeaders(token),
    });
    return handle<CompanyBankAccount[]>(res, 'Failed to set default bank account');
}

export async function deleteCompanyBankAccount(accountId: string, token: string): Promise<CompanyBankAccount[]> {
    const res = await fetch(`/api/companybankaccounts/${accountId}`, {
        method: 'DELETE', headers: authHeaders(token),
    });
    return handle<CompanyBankAccount[]>(res, 'Failed to delete bank account');
}
