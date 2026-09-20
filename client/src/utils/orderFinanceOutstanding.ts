import type { OrderFinanceLine } from '../api/orderFinance';

// Shared by AdminFinancePage.tsx and CustomerFinancePage.tsx so the two sides of the same
// customer↔company ledger can never drift on what "still owed" means for an order.

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Terminal cancelled statuses. A cancelled order that is NOT a billable failed delivery owes
// nothing — it's listed only for transparency (shown with "—" amounts).
export const CANCELLED_STATUSES = new Set(['CancelledByAdmin', 'CancelledBySender', 'OrderNotAccepted']);
export const isCancelledNonBillable = (o: OrderFinanceLine) =>
    CANCELLED_STATUSES.has(o.status) && !o.isBillableFailedDelivery;

// Service fee still owed by the sender: companyServicePrice minus whatever they've already
// paid. Use the server's computed truth (senderOwesService) so a failed delivery — whose fee
// shifts to the sender even when originally recipient-pays — is counted; a non-billable
// cancellation owes nothing even if it was sender-pays.
export const serviceOutstanding = (o: OrderFinanceLine) => (o.senderOwesService && !isCancelledNonBillable(o))
    ? round2(Math.max(0, o.companyServicePrice - (o.servicePaidByCustomerAmount ?? 0)))
    : 0;

// COD still owed back to the customer: codAmount minus whatever's already been paid out.
// 0 until delivered (nothing collected yet), and 0 for a billable failed delivery (the
// company never collected any COD on it).
export const codOutstanding = (o: OrderFinanceLine) => (o.deliveredAt && !o.isBillableFailedDelivery)
    ? round2(Math.max(0, (o.codAmount ?? 0) - (o.codPaidToCustomerAmount ?? 0)))
    : 0;
