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
    totalOrdersPickedUp: number;
    totalOrdersDelivered: number;
    /** COD cash collected from recipients for the product itself. */
    totalAmountOfCashCollected: number;
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

/** All financial totals are computed server-side; only the identity fields are required. */
export interface CreateSettlementRequest {
    courierId: string;
    date: string;                              // "YYYY-MM-DD"
}

export interface CreateSettlementResponse {
    settlementId: string;
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

/**
 * Courier-facing: fetches all daily settlement records for the authenticated courier.
 * Returns newest first. Requires a Courier-role JWT.
 */
export async function fetchMySettlements(token: string): Promise<CourierSettlementItem[]> {
    const res = await fetch('/api/settlements/my', {
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
