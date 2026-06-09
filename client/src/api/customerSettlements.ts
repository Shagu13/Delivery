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

/** A customer's aggregated outstanding balance across all their batch invoices. */
export interface CustomerOutstanding {
    customerId: string;
    businessName: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    /** Company owes the customer: collected COD not yet paid back. */
    outstandingCodOwedToCustomer: number;
    /** Customer owes the company: sender-paid service fees not yet paid. */
    outstandingServiceOwedToCompany: number;
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

/** All customers that currently owe, or are owed, money — for the finance overview. */
export async function fetchCustomersWithOutstanding(token: string): Promise<CustomerOutstanding[]> {
    const res = await fetch('/api/customersettlements/outstanding', {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<CustomerOutstanding[]>(res, 'Failed to load outstanding balances');
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

/** Download the Excel invoice for a single settlement. Triggers a browser file save. */
export async function downloadSettlementInvoice(
    settlementId: string, token: string,
): Promise<void> {
    const res = await fetch(`/api/customersettlements/${settlementId}/invoice`, {
        headers: authHeaders(token),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CustomerSettlementApiError(res.status, body?.title ?? `Download failed (${res.status})`);
    }
    const blob        = await res.blob();
    const url         = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match       = /filename[^;=\n]*=(['"]?)([^;"'\n]*)\1/.exec(disposition);
    const filename    = match?.[2]?.trim() || 'Dilo-Invoice.xlsx';
    const anchor      = document.createElement('a');
    anchor.href       = url;
    anchor.download   = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
