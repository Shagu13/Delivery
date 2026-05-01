// ── Types ─────────────────────────────────────────────────────────────────────

export interface SettlementOrderLine {
    id: string;
    trackingNumber: string;
    recipientName: string;
    recipientCity: string;
    recipientDistrict: string;
    companyServicePrice: number;
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
    totalAmountOfCashCollected: number;
    totalCompanyServiceRevenue: number;
    totalCourierSalary: number;
    totalCompanyNetIncome: number;
    orders: SettlementOrderLine[];
    incompleteOrderTrackingNumbers: string[];  // TN's that still need financial data
}

export interface CreateSettlementRequest {
    courierId: string;
    date: string;                              // "YYYY-MM-DD"
    totalOrdersPickedUp: number;
    totalOrdersDelivered: number;
    totalAmountOfCashCollected: number | null;
    totalCompanyServiceRevenue: number;
    totalCourierSalary: number;
    totalCompanyNetIncome: number;
}

export interface CreateSettlementResponse {
    settlementId: string;
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
