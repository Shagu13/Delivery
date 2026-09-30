import type { CourierOrder } from '../../../api/orders';

// What the courier has to collect in cash at the door — shared by the Deliveries list and the
// scan-to-deliver sheet so both agree on when the collect-confirm step is needed.

/** True when the recipient owes anything in cash: unpaid product COD and/or the service fee. */
export function needsCollect(o: CourierOrder): boolean {
    const codDue = o.productPaymentStatus === 'NotPaid' && o.amountToCollectForPackage != null && o.amountToCollectForPackage > 0;
    const feeDue = o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;
    return codDue || feeDue;
}

/** Total cash due at the door (product COD + the service fee when the recipient pays it). */
export function collectTotal(o: CourierOrder): number {
    const cod = o.productPaymentStatus === 'NotPaid' && o.amountToCollectForPackage != null ? o.amountToCollectForPackage : 0;
    const fee = o.whoPaysForCompanyService === 'Recipient' ? o.companyServicePrice : 0;
    return cod + fee;
}
