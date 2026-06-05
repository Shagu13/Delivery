// ── Types (mirror Application.CustomerStatistics.DTOs) ──────────────────────────

/** Order counts for one month of the selected year, split by outcome. */
export interface MonthlyOrderStat {
    month: number;        // 1–12
    placed: number;
    delivered: number;
    inTransit: number;
    cancelled: number;
}

/** A frequent recipient the customer ships to, with their latest contact details. */
export interface TopRecipient {
    name: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    orderCount: number;
}

/** Order activity statistics for the authenticated customer, scoped to one year. */
export interface CustomerStatistics {
    year: number;
    availableYears: number[];
    monthly: MonthlyOrderStat[];
    totalPlaced: number;
    totalDelivered: number;
    totalInTransit: number;
    totalCancelled: number;
    topRecipients: TopRecipient[];
}

// ── API ─────────────────────────────────────────────────────────────────────────

export class CustomerStatisticsApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'CustomerStatisticsApiError';
    }
}

/**
 * The authenticated customer's order statistics. `year` selects the calendar year;
 * omit it to get the most recent year with activity.
 */
export async function fetchMyCustomerStatistics(
    token: string, year?: number,
): Promise<CustomerStatistics> {
    const q = year ? `?year=${year}` : '';
    const res = await fetch(`/api/customerstatistics/my${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new CustomerStatisticsApiError(
            res.status, body?.title ?? `Failed to load statistics (${res.status})`);
    }
    return res.json() as Promise<CustomerStatistics>;
}
