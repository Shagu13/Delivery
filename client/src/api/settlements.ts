// ── Types ─────────────────────────────────────────────────────────────────────

export interface SettlementOrderLine {
    id: string;
    trackingNumber: string;
    recipientName: string;
    recipientCity: string;
    recipientDistrict: string;
    companyServicePrice: number;
    /** "Sender" | "Recipient" — which party paid the service fee */
    whoPaysForCompanyService: string;
    courierSalary: number | null;
    companyRevenue: number | null;
    amountOfCashCollected: number | null;
    deliveredAt: string | null;
}

/**
 * Read-only day summary for a courier on a date, derived live from delivered orders.
 * (Settlements are no longer stored rows — there is no create/update flow.)
 */
export interface SettlementPreview {
    courierId: string;
    courierFullName: string;
    date: string;                              // "YYYY-MM-DD"
    totalOrdersPickedUp: number;
    totalOrdersDelivered: number;
    /** Sum of AmountOfCashCollected — total cash physically collected (COD + service fees bundled for Recipient-payer orders). */
    totalAmountOfCashCollected: number;
    /** Sum of AmountToCollectForPackage — pure parcel/product money only, no service fees. Used for the COD display row. */
    totalCodOnlyAmount: number;
    /** Sum of ALL CompanyServicePrice values (regardless of who pays). */
    totalCompanyServiceRevenue: number;
    /** Service fees collected in cash directly from recipients (WhoPaysForCompanyService == Recipient). */
    totalServiceFeesCollectedFromRecipients: number;
    /** Total cash the courier physically holds: COD + service fees from recipients. */
    totalCashCourierHolds: number;
    totalCourierSalary: number;
    totalCompanyNetIncome: number;
    /** How much the courier must transfer to the company: totalCashCourierHolds − salary. */
    totalCourierTransferToCompany: number;
    orders: SettlementOrderLine[];
    incompleteOrderTrackingNumbers: string[];
}

/**
 * A courier's per-day summary, derived live by grouping delivered orders. Shared by the
 * admin "by courier" and courier "my" views. No stored row → no id / day-close flag.
 */
export interface CourierSettlementItem {
    date: string;                              // "YYYY-MM-DD" (delivery day)
    totalOrdersPickedUp: number;
    totalOrdersDelivered: number;
    numberOfOrdersCancelled: number;
    numberOfOrderPostponed: number;
    /** Total cash collected from recipients on this day. */
    totalAmountOfCashCollected: number;
    /** Sum of all delivery fees (company service price) for the day. */
    totalCompanyServiceRevenue: number;
    /** Courier's salary earned that day. */
    totalCourierSalary: number;
    /** How much of the salary has been credited to the courier so far. */
    totalCourierSalaryPaid: number;
    /** Cash the courier handed / must hand to the company. */
    totalCourierTransferToCompany: number;
    /** Company net cash from the day's orders (Σ per-order net). */
    totalCompanyNetIncome: number;
}

/** Admin view is the same shape (figures are read-only on both sides). */
export type AdminCourierSettlementItem = CourierSettlementItem;

// ── Errors ────────────────────────────────────────────────────────────────────

export class SettlementApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'SettlementApiError';
    }
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchSettlementPreview(
    courierId: string,
    date: string,
    token: string,
): Promise<SettlementPreview> {
    const res = await fetch(
        `/api/settlements/preview?courierId=${courierId}&date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new SettlementApiError(
            res.status,
            body?.title ?? `Failed to load settlement preview (${res.status})`,
        );
    }
    return res.json() as Promise<SettlementPreview>;
}

/**
 * Admin: returns the IDs of couriers who delivered at least one order on the given
 * date (YYYY-MM-DD). Used to narrow the settlement courier list to those active that day.
 */
export async function fetchCouriersWithDeliveries(
    date: string,
    token: string,
): Promise<string[]> {
    const res = await fetch(`/api/settlements/active-couriers?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new SettlementApiError(
            res.status,
            body?.title ?? `Failed to load active couriers (${res.status})`,
        );
    }
    return res.json() as Promise<string[]>;
}

/**
 * Admin: fetches all per-day settlement summaries for a specific courier (newest first).
 */
export async function fetchCourierSettlementsAdmin(
    courierId: string,
    token: string,
): Promise<AdminCourierSettlementItem[]> {
    const res = await fetch(`/api/settlements/by-courier/${courierId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new SettlementApiError(
            res.status,
            body?.title ?? `Failed to load courier settlements (${res.status})`,
        );
    }
    return res.json() as Promise<AdminCourierSettlementItem[]>;
}

/**
 * Courier-facing: per-day settlement summaries for the authenticated courier in a month.
 * Returns newest first. Requires a Courier-role JWT.
 */
export async function fetchMySettlements(
    token: string,
    year: number,
    month: number,
): Promise<CourierSettlementItem[]> {
    const res = await fetch(`/api/settlements/my?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new SettlementApiError(
            res.status,
            body?.title ?? `Failed to load settlements (${res.status})`,
        );
    }
    return res.json() as Promise<CourierSettlementItem[]>;
}
