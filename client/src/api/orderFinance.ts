// ── Types (mirror Application.CustomerSettlements.DTOs.OrderFinanceLineDto) ──────

/** A single-order finance row for the reworked finance pages. */
export interface OrderFinanceLine {
    orderId: string;
    trackingNumber: string;
    recipientName: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    orderType: string;
    status: string;
    productPaymentStatus: string; // "Paid" | "NotPaid"
    isReturn: boolean;

    customerId: string;
    customerBusinessName: string;

    /** Placement date (ISO-8601). */
    createdAt: string;
    /** Delivery date (ISO-8601) or null if not yet delivered. */
    deliveredAt: string | null;

    // COD payout: company → customer
    codAmount: number | null;
    isCollectedCodPaidToCustomer: boolean;
    codPaidToCustomerAmount: number | null;
    codPaidToCustomerAt: string | null;

    // Service fee: customer → company (sender-pays only)
    companyServicePrice: number;
    whoPaysForCompanyService: string; // "Sender" | "Recipient"
    companyServicePaymentStatus: string; // "Unpaid" | "Pending" | "Paid"
    servicePaidByCustomerAmount: number | null;
    servicePaidByCustomerAt: string | null;

    // Courier-facing
    courierSalary: number | null;
    amountOfCashCollected: number | null;

    // Courier settlement (per-order; admin-recorded)
    courierSalaryPaidAmount: number | null;
    courierSalaryPaidAt: string | null;
    isCourierSalaryPaid: boolean;
    codTransferedToCompanyByCourier: number | null;
    codTransferedToCompanyByCourierAt: string | null;
    hasCourierTransferedAmount: boolean;

    // Derived company figures (live; never stored)
    companyRevenue: number;
    companyNetCash: number;
    isCompanyServicePaid: boolean;
}

export interface OrderPaymentRequest {
    orderId: string;
    /** Amount for the COD payout; defaults server-side to the order's COD when omitted. */
    codPaidAmount?: number;
    /** Toggle COD payout paid/unpaid. Omit to leave unchanged. */
    codPaid?: boolean;
    /** Amount for the sender-paid service fee; defaults server-side to the service price. */
    servicePaidAmount?: number;
    /** Toggle service fee paid/unpaid. Omit to leave unchanged. */
    servicePaid?: boolean;
}

// ── Error ───────────────────────────────────────────────────────────────────────

export class OrderFinanceApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'OrderFinanceApiError';
    }
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new OrderFinanceApiError(res.status, body?.title ?? `${fallback} (${res.status})`);
    }
    return res.json() as Promise<T>;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', ...authHeaders(token) });

// ── Customer (read-only) — own orders ────────────────────────────────────────────
// Placement view (default): all orders, `date` narrows by CreatedAt.
// Payments view (paymentsMode): only paid orders, `date` narrows by CodPaidToCustomerAt.
export async function fetchMyOrderFinance(
    token: string, date?: string, paymentsMode = false,
): Promise<OrderFinanceLine[]> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (paymentsMode) params.set('paymentsMode', 'true');
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/orderfinance/my${q}`, { headers: authHeaders(token), cache: 'no-store' });
    return handle<OrderFinanceLine[]>(res, 'Failed to load orders');
}

// ── Admin — a customer's orders by delivery date ─────────────────────────────────
// `monthly` widens the `date` filter to its whole calendar month (day ignored).
export async function fetchCustomerOrderFinance(
    customerId: string, token: string, date?: string, monthly = false,
): Promise<OrderFinanceLine[]> {
    const params = new URLSearchParams({ customerId });
    if (date) params.set('date', date);
    if (monthly) params.set('monthly', 'true');
    const res = await fetch(`/api/orderfinance/customer?${params}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<OrderFinanceLine[]>(res, 'Failed to load orders');
}

// ── Courier (read-only) — own delivered orders by delivery date ──────────────────
export async function fetchCourierOrderFinance(token: string, date?: string): Promise<OrderFinanceLine[]> {
    const q = date ? `?date=${date}` : '';
    const res = await fetch(`/api/orderfinance/courier${q}`, { headers: authHeaders(token), cache: 'no-store' });
    return handle<OrderFinanceLine[]>(res, 'Failed to load orders');
}

// ── Admin — a courier's delivered orders by delivery date ────────────────────────
export async function fetchCourierOrderFinanceAdmin(
    courierId: string, token: string, date?: string,
): Promise<OrderFinanceLine[]> {
    const params = new URLSearchParams({ courierId });
    if (date) params.set('date', date);
    const res = await fetch(`/api/orderfinance/courier-lines?${params}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<OrderFinanceLine[]>(res, 'Failed to load courier orders');
}

// ── Admin — record/clear a per-order payment ─────────────────────────────────────
export async function recordOrderPayment(
    data: OrderPaymentRequest, token: string,
): Promise<{ orderId: string }> {
    const res = await fetch('/api/orderfinance/payment', {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(data),
    });
    return handle<{ orderId: string }>(res, 'Failed to record payment');
}

// ── Admin — pay across a customer's orders (full or allocated subset) ─────────────
// service=false → COD payout (company → customer); service=true → service fee (customer → company).
export interface OrderAllocation { orderId: string; amount: number; }

export async function payCustomerOrders(
    customerId: string, service: boolean, allocations: OrderAllocation[], token: string,
): Promise<{ paid: number }> {
    const res = await fetch('/api/orderfinance/pay', {
        method: 'POST', headers: jsonHeaders(token),
        body: JSON.stringify({ customerId, service, allocations }),
    });
    return handle<{ paid: number }>(res, 'Failed to record payment');
}

// ── Admin — courier side: record/clear a per-order courier payment ───────────────
export interface CourierPaymentRequest {
    orderId: string;
    /** Amount toward the courier's salary; defaults server-side to CourierSalary. */
    salaryPaidAmount?: number;
    /** Toggle salary paid/unpaid. Omit to leave unchanged. */
    salaryPaid?: boolean;
    /** Amount of COD cash handed over; defaults server-side to the full collected cash (net of kept salary). */
    codTransferredAmount?: number;
    /** Toggle COD hand-over recorded/cleared. Omit to leave unchanged. */
    codTransferred?: boolean;
}

export async function recordCourierPayment(
    data: CourierPaymentRequest, token: string,
): Promise<{ orderId: string }> {
    const res = await fetch('/api/orderfinance/courier-payment', {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(data),
    });
    return handle<{ orderId: string }>(res, 'Failed to record courier payment');
}

// ── Admin — courier side: pay salary / record COD transfers across a courier's orders ──
export type CourierPaymentFlow = 'Salary' | 'CodTransfer';

export async function payCourierOrders(
    courierId: string, flow: CourierPaymentFlow, allocations: OrderAllocation[], token: string,
): Promise<{ paid: number }> {
    const res = await fetch('/api/orderfinance/courier-pay', {
        method: 'POST', headers: jsonHeaders(token),
        body: JSON.stringify({ courierId, flow, allocations }),
    });
    return handle<{ paid: number }>(res, 'Failed to record courier payment');
}
