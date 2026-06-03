// ── Types (mirror Application.CustomerSettlements.DTOs) ─────────────────────────

/** A stored monthly customer settlement row. Outstanding balances are derived server-side. */
export interface CustomerSettlement {
    id: string;
    customerId: string;
    customerBusinessName: string;
    year: number;
    month: number;

    totalNumberOfOrdersPlaced: number;
    totalNumberOfOrderDelivered: number;

    // COD the company collected for the customer's packages (company owes customer)
    totalCODCompanyCollectedForPackages: number;
    totalAmountOfCollectedCodPaidByCompany: number;
    amountOfCollectedCodPaidByCompany: number;
    outstandingCodOwedToCustomer: number;

    // Service fees the customer owes the company (customer owes company)
    totalCompanyServicePriceOwedToCompany: number;
    totalAmountPaidToCompanyForCompanyService: number;
    amountPaidToCompanyForCompanyService: number;
    outstandingServiceOwedToCompany: number;

    createdAt: string;          // ISO-8601
    updatedAt: string | null;   // ISO-8601 or null
}

/** Admin preview: live figures from current orders + the saved row (if any). */
export interface CustomerSettlementPreview {
    customerId: string;
    customerBusinessName: string;
    year: number;
    month: number;
    ordersPlaced: number;
    ordersDelivered: number;
    codCollectedForPackages: number;
    companyServicePriceOwed: number;
    existingSettlement: CustomerSettlement | null;
}

export interface PeriodRequest {
    customerId: string;
    year: number;
    month: number;
}

export interface RecordPaymentRequest {
    customerId: string;
    year: number;
    month: number;
    /** COD the company pays the customer (omit if not paying COD this time). */
    codPaidByCompany?: number;
    /** Service fee the customer pays the company (omit if not paying service this time). */
    servicePaidToCompany?: number;
}

// ── Error ───────────────────────────────────────────────────────────────────────

export class CustomerSettlementApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'CustomerSettlementApiError';
    }
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CustomerSettlementApiError(res.status, body?.title ?? `${fallback} (${res.status})`);
    }
    return res.json() as Promise<T>;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', ...authHeaders(token) });

// ── Admin API ─────────────────────────────────────────────────────────────────

export async function fetchCustomerSettlementPreview(
    customerId: string, year: number, month: number, token: string,
): Promise<CustomerSettlementPreview> {
    const res = await fetch(
        `/api/customersettlements/preview?customerId=${customerId}&year=${year}&month=${month}`,
        { headers: authHeaders(token) },
    );
    return handle<CustomerSettlementPreview>(res, 'Failed to load settlement preview');
}

export async function fetchCustomerSettlements(
    customerId: string, token: string, year?: number,
): Promise<CustomerSettlement[]> {
    const q = year ? `&year=${year}` : '';
    const res = await fetch(
        `/api/customersettlements?customerId=${customerId}${q}`,
        { headers: authHeaders(token) },
    );
    return handle<CustomerSettlement[]>(res, 'Failed to load settlements');
}

export async function createCustomerSettlement(
    data: PeriodRequest, token: string,
): Promise<{ settlementId: string }> {
    const res = await fetch('/api/customersettlements', {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(data),
    });
    return handle<{ settlementId: string }>(res, 'Failed to create settlement');
}

export async function recomputeCustomerSettlement(
    data: PeriodRequest, token: string,
): Promise<{ settlementId: string }> {
    const res = await fetch('/api/customersettlements', {
        method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify(data),
    });
    return handle<{ settlementId: string }>(res, 'Failed to recompute settlement');
}

export async function recordCustomerSettlementPayment(
    data: RecordPaymentRequest, token: string,
): Promise<{ settlementId: string }> {
    const res = await fetch('/api/customersettlements/payment', {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(data),
    });
    return handle<{ settlementId: string }>(res, 'Failed to record payment');
}

// ── Customer API (read-only) ────────────────────────────────────────────────────

export async function fetchMyCustomerSettlements(
    token: string, year?: number,
): Promise<CustomerSettlement[]> {
    const q = year ? `?year=${year}` : '';
    const res = await fetch(`/api/customersettlements/my${q}`, { headers: authHeaders(token) });
    return handle<CustomerSettlement[]>(res, 'Failed to load your finance records');
}
