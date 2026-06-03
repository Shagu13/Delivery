// ── Types (mirror Application.CompanyFinance.DTOs) ──────────────────────────────

/** Live company finance overview for a date range, derived from delivered orders. */
export interface CompanyFinanceOverview {
    from: string;                       // "YYYY-MM-DD" inclusive
    to: string;                         // "YYYY-MM-DD" inclusive
    ordersDelivered: number;
    serviceRevenue: number;             // Σ CompanyServicePrice (all payers)
    serviceCollectedByRecipient: number;// cash slice collected at delivery
    serviceInvoicedToSenders: number;   // receivable slice
    courierSalary: number;              // direct cost
    netOperatingMargin: number;         // serviceRevenue − courierSalary
    codPassThrough: number;             // customer money, NOT revenue
}

export class CompanyFinanceApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'CompanyFinanceApiError';
    }
}

export async function fetchCompanyFinanceOverview(
    from: string, to: string, token: string,
): Promise<CompanyFinanceOverview> {
    const res = await fetch(
        `/api/companyfinance/overview?from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CompanyFinanceApiError(res.status, body?.title ?? `Failed to load overview (${res.status})`);
    }
    return res.json() as Promise<CompanyFinanceOverview>;
}
