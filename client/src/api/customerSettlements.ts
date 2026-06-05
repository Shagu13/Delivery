// ── Types (mirror Application.CustomerSettlements.DTOs) ─────────────────────────

/** A per-batch customer invoice (one GroupOrder batch or one standalone Return). */
export interface CustomerSettlement {
    id: string;
    customerId: string;
    customerBusinessName: string;

    /** Set for a Send/Exchange batch; null for a standalone Return. */
    groupOrderId: string | null;
    /** Set for a standalone Return; null for a batch. */
    orderId: string | null;
    isReturn: boolean;
    numberOfPackages: number;
    /** Batch / order status (enum name, e.g. "DeliveredToRecipient"). */
    status: string;

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

    /** Batch placement date (ISO-8601). */
    createdAt: string;
    updatedAt: string | null;
}

export interface RecordPaymentRequest {
    /** The batch invoice to record the payment against. */
    settlementId: string;
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

/** A customer's batch invoices, newest first. `date` filters to batches placed on that day ("YYYY-MM-DD"). */
export async function fetchCustomerSettlements(
    customerId: string, token: string, date?: string,
): Promise<CustomerSettlement[]> {
    const q = date ? `&date=${date}` : '';
    const res = await fetch(
        `/api/customersettlements?customerId=${customerId}${q}`,
        { headers: authHeaders(token), cache: 'no-store' },
    );
    return handle<CustomerSettlement[]>(res, 'Failed to load invoices');
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

/** The authenticated customer's own batch invoices. `date` filters to batches placed on that day ("YYYY-MM-DD"). */
export async function fetchMyCustomerSettlements(
    token: string, date?: string,
): Promise<CustomerSettlement[]> {
    const q = date ? `?date=${date}` : '';
    const res = await fetch(`/api/customersettlements/my${q}`, { headers: authHeaders(token) });
    return handle<CustomerSettlement[]>(res, 'Failed to load your finance records');
}
