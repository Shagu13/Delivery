// ── Types (mirror Application.CompanyFinance.DTOs) ──────────────────────────────

/** Company finance overview: profit (accrual) + cash position (actual money). */
export interface CompanyFinanceOverview {
    from: string;                       // "YYYY-MM-DD" inclusive
    to: string;                         // "YYYY-MM-DD" inclusive
    ordersDelivered: number;

    // Profit (accrual, from delivered orders in [from, to])
    serviceRevenue: number;             // Σ CompanyServicePrice (all payers)
    serviceCollectedFromRecipient: number;// cash slice collected at delivery
    serviceInvoicedToSenders: number;   // receivable slice
    courierSalary: number;              // direct cost
    netOperatingMargin: number;         // serviceRevenue − courierSalary
    codPassThrough: number;             // customer money, NOT revenue

    // Cash position (actual money, from settlements, as of `to`)
    cashInFromCouriers: number;         // cash couriers handed over
    senderServicePaid: number;          // service fees senders paid the company
    codPaidToCustomers: number;         // COD the company paid back out
    salaryPaidToCouriers: number;       // salary the company paid
    netCashPosition: number;            // in + servicePaid − codPaid − salaryPaid

    // Outstanding balances (as of `to`)
    outstandingCodOwedToCustomers: number; // company owes customers
    outstandingServiceReceivable: number;  // customers owe company
    outstandingSalaryOwed: number;         // company owes couriers
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
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CompanyFinanceApiError(res.status, body?.title ?? `Failed to load overview (${res.status})`);
    }
    return res.json() as Promise<CompanyFinanceOverview>;
}
