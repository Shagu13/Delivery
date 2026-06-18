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

export interface SettlementPreview {
    courierId: string;
    courierFullName: string;
    date: string;                              // "YYYY-MM-DD"
    /** Non-null if a settlement already exists for this courier+date. */
    existingSettlementId: string | null;
    /** When a settlement already exists, the amount the courier was last recorded as paid; null otherwise. */
    existingAmountCourierWasPaid: number | null;
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
 * All financial totals are computed server-side. The caller supplies the identity
 * fields plus how much the admin actually paid the courier for this settlement.
 */
export interface CreateSettlementRequest {
    courierId: string;
    date: string;                              // "YYYY-MM-DD"
    /** Amount the admin paid the courier for this settlement → recorded as AmountCourierWasPaid. */
    partialAmountPaid: number;
}

export interface CreateSettlementResponse {
    settlementId: string;
}

/** Daily settlement record with all admin-visible fields (payment amounts, cancel/postpone counts). */
export interface AdminCourierSettlementItem {
    id: string;
    date: string;
    totalOrdersPickedUp: number;
    totalOrdersDelivered: number;
    numberOfOrdersCancelled: number;
    numberOfOrderPostponed: number;
    totalAmountOfCashCollected: number;
    totalCompanyServiceRevenue: number;
    totalCourierSalary: number;
    amountCourierWasPaid: number;
    totalCourierTransferToCompany: number;
    isTheDayClosed: boolean;
}

/** A daily settlement record as returned to the courier (no admin-only fields). */
export interface CourierSettlementItem {
    id: string;
    date: string;                              // "YYYY-MM-DD"
    totalOrdersPickedUp: number;
    totalOrdersDelivered: number;
    /** Total cash collected from recipients on this day. */
    totalAmountOfCashCollected: number;
    /** Sum of all delivery fees (company service price) for the day. */
    totalCompanyServiceRevenue: number;
    /** Courier's own salary earned that day. */
    totalCourierSalary: number;
    /** How much of the salary the courier has actually been paid so far. */
    amountCourierWasPaid: number;
    /** Amount the courier must hand over to the company (cash − salary). */
    totalCourierTransferToCompany: number;
    isTheDayClosed: boolean;
}

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

export async function createSettlement(
    data: CreateSettlementRequest,
    token: string,
): Promise<CreateSettlementResponse> {
    const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new SettlementApiError(
            res.status,
            body?.title ?? `Failed to create settlement (${res.status})`,
        );
    }
    return res.json() as Promise<CreateSettlementResponse>;
}

export async function updateSettlement(
    data: CreateSettlementRequest,
    token: string,
): Promise<CreateSettlementResponse> {
    const res = await fetch('/api/settlements', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new SettlementApiError(
            res.status,
            body?.title ?? `Failed to update settlement (${res.status})`,
        );
    }
    return res.json() as Promise<CreateSettlementResponse>;
}

/**
 * Admin: fetches all daily settlement records for a specific courier.
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
 * Courier-facing: fetches all daily settlement records for the authenticated courier.
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