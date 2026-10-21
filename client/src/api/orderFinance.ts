// ── Types (mirror Application.CustomerSettlements.DTOs.OrderFinanceLineDto) ──────

/** A single-order finance row for the reworked finance pages. */
export interface OrderFinanceLine {
    orderId: string;
    trackingNumber: string;
    recipientName: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddress: string;
    recipientPhone: string;
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
    /** Customer owes the service fee (sender-pays OR a billable failed delivery). Use this,
     *  not whoPaysForCompanyService, to decide whether the fee is owed. */
    senderOwesService: boolean;
    /** Billable failed delivery: no COD owed back, but the sender still owes the service fee. */
    isBillableFailedDelivery: boolean;
    /** Cancellation reason (enum name) when set — used to label why a failed delivery is charged. */
    cancellationReason: string | null;
    /** Free-text comment for the "Other" cancellation reason, if any. */
    cancellationComment: string | null;
    /** Free-text comment left when a delivery was postponed with the "Other" reason, if any. */
    postponeComment: string | null;
    /** The note the customer typed when placing the batch (GroupOrder.Note), if any. */
    orderNote: string | null;
    /** The package description entered for this order, if any. */
    description: string | null;
    /** Salary still owed to the courier — the cap for a bulk salary payment (OrderFinance.CourierSalaryOutstanding). */
    courierSalaryOutstanding: number;
    /** Cash the courier may still record as handed over — the cap for a bulk COD hand-over
     *  (OrderFinance.CourierCodTransferOutstanding). */
    courierCodTransferOutstanding: number;

    /** The part of the service fee the sender owes on top of what the recipient pays (0 for an ordinary order). */
    customerSurcharge: number;
    /** What the sender still owes for the service fee — server-computed (OrderFinance.ServiceOwedBySender):
     *  the whole fee less payments on sender-pays orders and billable failures, only the unpaid
     *  surcharge on a recipient-pays order, 0 otherwise. */
    serviceOwedBySender: number;
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

/** Fetches an Excel file and triggers a browser download, reading the filename off
 *  Content-Disposition when present. Shared by the finance export functions below. */
async function downloadExcel(url: string, token: string, fallbackFilename: string): Promise<void> {
    const res = await fetch(url, { headers: authHeaders(token) });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new OrderFinanceApiError(res.status, body?.title ?? `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename[^;=\n]*=(['"]?)([^;"'\n]*)\1/.exec(disposition);
    const filename = match?.[2]?.trim() || fallbackFilename;
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
}

// ── Customer (read-only) — own orders ────────────────────────────────────────────
// Placement view (default): all orders, `date` narrows by CreatedAt.
// Payments view (paymentsMode): only paid orders, `date` narrows by CodPaidToCustomerAt.
export async function fetchMyOrderFinance(
    token: string, date?: string, paymentsMode = false,
    opts: { monthly?: boolean; from?: string; to?: string } = {},
): Promise<OrderFinanceLine[]> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (paymentsMode) params.set('paymentsMode', 'true');
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/orderfinance/my${q}`, { headers: authHeaders(token), cache: 'no-store' });
    return handle<OrderFinanceLine[]>(res, 'Failed to load orders');
}

// ── Customer — download own orders as Excel, matching the same date filter ───────
export async function downloadMyOrderFinanceExcel(
    token: string, date?: string, paymentsMode = false,
    opts: { monthly?: boolean; from?: string; to?: string; lang?: string } = {},
): Promise<void> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (paymentsMode) params.set('paymentsMode', 'true');
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.lang) params.set('lang', opts.lang);
    const q = params.toString() ? `?${params}` : '';
    await downloadExcel(`/api/orderfinance/my/export${q}`, token, 'finance.xlsx');
}

// ── Customer — download an invoice of own sender-pays orders, with the company's default
//    bank account and a service-fee total, matching the same date filter ────────────────
export async function downloadMyOrderFinanceInvoiceExcel(
    token: string, date?: string, paymentsMode = false,
    opts: { monthly?: boolean; from?: string; to?: string; lang?: string } = {},
): Promise<void> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (paymentsMode) params.set('paymentsMode', 'true');
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.lang) params.set('lang', opts.lang);
    const q = params.toString() ? `?${params}` : '';
    await downloadExcel(`/api/orderfinance/my/invoice-export${q}`, token, 'invoice.xlsx');
}

// ── Admin — a customer's orders by delivery date ─────────────────────────────────
// `monthly` widens the `date` filter to its whole calendar month (day ignored).
export async function fetchCustomerOrderFinance(
    customerId: string, token: string,
    opts: { date?: string; monthly?: boolean; from?: string; to?: string } = {},
): Promise<OrderFinanceLine[]> {
    const params = new URLSearchParams({ customerId });
    if (opts.date) params.set('date', opts.date);
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    const res = await fetch(`/api/orderfinance/customer?${params}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<OrderFinanceLine[]>(res, 'Failed to load orders');
}

// ── Admin — download a customer's orders as Excel, matching the same date filter ──
export async function downloadCustomerOrderFinanceExcel(
    customerId: string, token: string,
    opts: { date?: string; monthly?: boolean; from?: string; to?: string } = {},
): Promise<void> {
    const params = new URLSearchParams({ customerId });
    if (opts.date) params.set('date', opts.date);
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    await downloadExcel(`/api/orderfinance/customer/export?${params}`, token, 'finance.xlsx');
}

// ── Admin — every customer's orders for a date/range, grouped client-side by customer ──
export async function fetchAllCustomersOrderFinance(
    token: string,
    opts: { date?: string; monthly?: boolean; from?: string; to?: string } = {},
): Promise<OrderFinanceLine[]> {
    const params = new URLSearchParams();
    if (opts.date) params.set('date', opts.date);
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/orderfinance/all-customers${q}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<OrderFinanceLine[]>(res, 'Failed to load customers');
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

// ── Payment receipts (mirror Application.CustomerSettlements.DTOs.PaymentReceiptDto) ──
// One admin pay/settle action — a COD payout or service-fee collection covering one or
// more orders in a single click — browsable by date on both the admin and customer
// finance pages.

export interface PaymentReceiptOrder {
    orderId: string;
    trackingNumber: string;
    recipientName: string;
    recipientAddress: string;
    /** Delivery date (ISO-8601), or null if not yet delivered. */
    deliveredAt: string | null;
    /** Courier who delivered the order, or null if not yet assigned/delivered. */
    courierName: string | null;
    amount: number;
}

export type PaymentReceiptFlow = 'CodPayout' | 'ServiceFee' | 'CourierSalary' | 'CourierCodTransfer';

export interface PaymentReceipt {
    id: string;
    /** Customer receipts: false = COD payout (company → customer); true = service fee collected
     *  (customer → company). Courier receipts leave it false — read `flow` instead. */
    isService: boolean;
    totalAmount: number;
    /** When the payment was recorded (ISO-8601). */
    paidAt: string;
    orders: PaymentReceiptOrder[];
    flow: PaymentReceiptFlow;
    /** Set for courier receipts only (CourierSalary / CourierCodTransfer). */
    courierId: string | null;
    courierName: string | null;
}

interface PaymentReceiptDateOpts { date?: string; monthly?: boolean; from?: string; to?: string; }

function paymentReceiptParams(opts: PaymentReceiptDateOpts): URLSearchParams {
    const params = new URLSearchParams();
    if (opts.date) params.set('date', opts.date);
    if (opts.monthly) params.set('monthly', 'true');
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    return params;
}

// ── Admin — a customer's payment history ──────────────────────────────────────────
export async function fetchCustomerPaymentReceipts(
    customerId: string, token: string, opts: PaymentReceiptDateOpts = {},
): Promise<PaymentReceipt[]> {
    const params = paymentReceiptParams(opts);
    params.set('customerId', customerId);
    const res = await fetch(`/api/orderfinance/payment-receipts?${params}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<PaymentReceipt[]>(res, 'Failed to load payment history');
}

// ── Admin — courier payment history (salary paid / COD hand-over); omit courierId for all ──
export async function fetchCourierPaymentReceiptsAdmin(
    token: string, opts: PaymentReceiptDateOpts & { courierId?: string } = {},
): Promise<PaymentReceipt[]> {
    const params = paymentReceiptParams(opts);
    if (opts.courierId) params.set('courierId', opts.courierId);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/orderfinance/payment-receipts/couriers${q}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<PaymentReceipt[]>(res, 'Failed to load courier payment history');
}

// ── Courier — own payment history ─────────────────────────────────────────────────
export async function fetchMyCourierPaymentReceipts(
    token: string, opts: PaymentReceiptDateOpts = {},
): Promise<PaymentReceipt[]> {
    const params = paymentReceiptParams(opts);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/orderfinance/payment-receipts/courier/my${q}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<PaymentReceipt[]>(res, 'Failed to load payment history');
}

// ── Customer — own payment history ────────────────────────────────────────────────
export async function fetchMyPaymentReceipts(
    token: string, opts: PaymentReceiptDateOpts = {},
): Promise<PaymentReceipt[]> {
    const params = paymentReceiptParams(opts);
    const q = params.toString() ? `?${params}` : '';
    const res = await fetch(`/api/orderfinance/payment-receipts/my${q}`, {
        headers: authHeaders(token), cache: 'no-store',
    });
    return handle<PaymentReceipt[]>(res, 'Failed to load payment history');
}
