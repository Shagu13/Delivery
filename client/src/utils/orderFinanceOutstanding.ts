import type { OrderFinanceLine } from '../api/orderFinance';

// Shared by AdminFinancePage.tsx and CustomerFinancePage.tsx so the two sides of the same
// customer↔company ledger can never drift on what "still owed" means for an order.

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Terminal cancelled statuses. A cancelled order that is NOT a billable failed delivery owes
// nothing — it's listed only for transparency (shown with "—" amounts).
export const CANCELLED_STATUSES = new Set(['CancelledByAdmin', 'CancelledBySender', 'OrderNotAccepted']);
export const isCancelledNonBillable = (o: OrderFinanceLine) =>
    CANCELLED_STATUSES.has(o.status) && !o.isBillableFailedDelivery;

// Service fee still owed by the sender. Use the server's own figure (serviceOwedBySender =
// OrderFinance.ServiceOwedBySender): the whole fee less payments on a sender-pays order or a
// failed delivery (whose fee shifts to the sender even when originally recipient-pays), only the
// unpaid customer surcharge on a recipient-pays order. A non-billable cancellation owes nothing
// even if it was sender-pays.
export const serviceOutstanding = (o: OrderFinanceLine) => isCancelledNonBillable(o)
    ? 0
    : round2(Math.max(0, o.serviceOwedBySender));

// The part of the fee the sender is billed: the whole fee when they pay it, else only the surcharge.
export const senderServiceShare = (o: OrderFinanceLine) =>
    o.senderOwesService ? o.companyServicePrice : o.customerSurcharge;

// The part of the fee the recipient hands the courier at the door: the fee minus any surcharge the
// sender owes. Works on any order shape that carries the two numbers (admin, customer, finance rows).
export const recipientFeePortion = (o: { companyServicePrice?: number | null; customerSurcharge?: number | null }) =>
    Math.max(0, (o.companyServicePrice ?? 0) - (o.customerSurcharge ?? 0));

// COD still owed back to the customer: codAmount minus whatever's already been paid out.
// 0 until delivered (nothing collected yet), and 0 for a billable failed delivery (the
// company never collected any COD on it).
export const codOutstanding = (o: OrderFinanceLine) => (o.deliveredAt && !o.isBillableFailedDelivery)
    ? round2(Math.max(0, (o.codAmount ?? 0) - (o.codPaidToCustomerAmount ?? 0)))
    : 0;
