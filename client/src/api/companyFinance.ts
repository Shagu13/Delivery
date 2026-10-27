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
    outstandingCourierRemittance: number;  // couriers owe company (cash collected, not yet sent in)
}

/** Which profit-block bucket of the overview an order is counted in. */
export type CompanyFinanceOrderGroup = 'Delivered' | 'BillableFailed';

/** One order behind the overview's profit figures (mirror of CompanyFinanceOrderDto). */
export interface CompanyFinanceOrder {
    orderId: string;
    trackingNumber: string;
    group: CompanyFinanceOrderGroup;
    orderType: string;
    status: string;
    cancellationReason: string | null;
    eventAt: string | null;             // the date that put it in range
    recipientCity: string;
    recipientDistrict: string;
    customerName: string | null;
    courierName: string | null;
    whoPaysForCompanyService: string;
    serviceFee: number;                 // summed into serviceRevenue
    courierSalary: number | null;       // summed into courierSalary
    margin: number;                     // summed into netOperatingMargin
    cod: number | null;                 // summed into codPassThrough (Delivered only)
}

export interface CompanyFinanceOrders {
    from: string;
    to: string;
    orders: CompanyFinanceOrder[];
}

export class CompanyFinanceApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'CompanyFinanceApiError';
    }
}

export async function fetchCompanyFinanceOverview(
    from: string, to: string, token: string,
    // Recipient-area narrowing: city facet AND district facet (each applied only when
    // non-empty) — mirrors the Packages page's multi city/district filter. Empty = all areas.
    cities: string[] = [],
    districts: string[] = [],
): Promise<CompanyFinanceOverview> {
    const qs = new URLSearchParams({ from, to });
    if (cities.length > 0)    qs.set('city', cities.join(','));
    if (districts.length > 0) qs.set('district', districts.join(','));
    const res = await fetch(
        `/api/companyfinance/overview?${qs}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CompanyFinanceApiError(res.status, body?.title ?? `Failed to load overview (${res.status})`);
    }
    return res.json() as Promise<CompanyFinanceOverview>;
}

/** The orders behind the overview's profit figures — same range and area filter. */
export async function fetchCompanyFinanceOrders(
    from: string, to: string, token: string,
    cities: string[] = [],
    districts: string[] = [],
): Promise<CompanyFinanceOrders> {
    const qs = new URLSearchParams({ from, to });
    if (cities.length > 0)    qs.set('city', cities.join(','));
    if (districts.length > 0) qs.set('district', districts.join(','));
    const res = await fetch(
        `/api/companyfinance/orders?${qs}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CompanyFinanceApiError(res.status, body?.title ?? `Failed to load orders (${res.status})`);
    }
    return res.json() as Promise<CompanyFinanceOrders>;
}
