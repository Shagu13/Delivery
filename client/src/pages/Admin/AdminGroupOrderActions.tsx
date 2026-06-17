import { useState } from 'react';
import type { AdminGroupOrder, AdminOrder } from '../../api/adminGroupOrders';
import {
    acceptGroupOrder,
    declineGroupOrder,
    assignCourierToGroupOrder,
    acceptGroupOrderInWarehouse,
    cancelGroupOrderByAdmin,
    setGroupOrderPickupDate,
} from '../../api/adminGroupOrders';
import { sendOrderToCity, cancelOrderByAdmin } from '../../api/orders';
import type { Courier } from '../../api/couriers';
import { useLanguage } from '../../contexts/useLanguage';
import { printParcelLabels, type ParcelLabelData } from '../../utils/printLabel';

// Print icon shared by the label buttons.
const printIcon = (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M4.5 6V2.5h7V6M4.5 11.5h-1A1.5 1.5 0 0 1 2 10V8a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 8v2a1.5 1.5 0 0 1-1.5 1.5h-1M4.5 9.5h7v4h-7z"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Amount the recipient pays — mirrors the customer dashboard / packages-page label logic
// so the printed sticker matches: COD (only when not prepaid) + the company service fee
// (only when the recipient pays it and it isn't already baked into the COD figure).
function recipientAmountDue(o: AdminOrder): number {
    const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
    const fee = (!o.isCompanyServicePriceIncluded && o.whoPaysForCompanyService === 'Recipient')
        ? (o.companyServicePrice ?? 0) : 0;
    return cod + fee;
}

// Build the Georgian parcel-sticker payload for one package of a group order.
function buildLabel(storeName: string, o: AdminOrder): ParcelLabelData {
    const due = recipientAmountDue(o);
    const city     = o.recipientCityGeo     || o.recipientCity;
    const district = o.recipientDistrictGeo || o.recipientDistrict;
    return {
        storeName,
        recipientName:    o.recipientName,
        recipientPhone:   o.recipientPhone,
        recipientAddress: [o.recipientAddress, district, city].filter(Boolean).join(', '),
        amountText:       due > 0.005 ? `₾${due.toFixed(2)}` : 'გადახდილია',
        description:      o.description ?? undefined,
        trackingNumber:   o.trackingNumber,
    };
}


interface Props {
    groupOrder: AdminGroupOrder;
    couriers: Courier[];
    token: string;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
    onRefresh: () => void;
}

export function AdminGroupOrderActions({ groupOrder, couriers, token, onSuccess, onError, onRefresh }: Props) {
    const [busy, setBusy] = useState(false);
    const [showCourierPicker, setShowCourierPicker] = useState(false);
    const [selectedCourierId, setSelectedCourierId] = useState('');
    const [showPickupDate, setShowPickupDate] = useState(false);
    const [pickupDateValue, setPickupDateValue] = useState('');
    const { t } = useLanguage();

    async function run(fn: () => Promise<void>, successMsg: string) {
        setBusy(true);
        try {
            await fn();
            onSuccess(successMsg);
            onRefresh();
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : 'Action failed.');
        } finally {
            setBusy(false);
        }
    }

    async function handleAssignGroupCourier() {
        if (!selectedCourierId) return;
        await run(
            () => assignCourierToGroupOrder(token, groupOrder.id, selectedCourierId),
            t.goAssignedPickup
        );
        setShowCourierPicker(false);
        setSelectedCourierId('');
    }

    async function handleSetPickupDate() {
        if (!pickupDateValue) return;
        await run(
            () => setGroupOrderPickupDate(token, groupOrder.id, new Date(pickupDateValue).toISOString()),
            t.goPickupDateSet
        );
        setShowPickupDate(false);
        setPickupDateValue('');
    }

    const { status } = groupOrder;
    const isCancelledOrDone =
        status === 'CancelledByAdmin' || status === 'CancelledBySender' ||
        status === 'OrderNotAccepted' || status === 'AllDelivered';

    return (
        <div className="go-actions" onClick={e => e.stopPropagation()}>

            {/* Print labels for every package in this group order. Available at any
                stage so labels can be (re)printed whenever needed. */}
            {groupOrder.orders.length > 0 && (
                <button
                    type="button"
                    className="go-action-btn go-action-btn--ghost"
                    title={t.custPrintAllLabels}
                    onClick={() => void printParcelLabels(
                        groupOrder.orders.map(o => buildLabel(groupOrder.senderBusinessName, o))
                    )}
                >
                    {printIcon}
                    {t.custPrintAllLabels}
                </button>
            )}

            {/* Step 1: Accept or Decline pending order */}
            {status === 'Pending' && (
                <>
                    <button className="go-action-btn go-action-btn--accept" disabled={busy}
                        onClick={() => run(() => acceptGroupOrder(token, groupOrder.id), t.goGroupAccepted)}>
                        {t.goAccept}
                    </button>
                    <button className="go-action-btn go-action-btn--decline" disabled={busy}
                        onClick={() => run(() => declineGroupOrder(token, groupOrder.id), t.goGroupDeclined)}>
                        {t.goDecline}
                    </button>
                </>
            )}

            {/* Step 1b: Assign courier / set pickup date. Shown while awaiting pickup —
                AcceptedGroupOrder (first assignment) and CourierAssignedToPickUp (re-assign). */}
            {(status === 'AcceptedGroupOrder' || status === 'CourierAssignedToPickUp') && !showCourierPicker && !showPickupDate && (
                <>
                    <button className="go-action-btn go-action-btn--assign" disabled={busy}
                        onClick={() => setShowCourierPicker(true)}>
                        {status === 'CourierAssignedToPickUp' ? t.goReassignCourierBtn : t.goAssignCourierBtn}
                    </button>
                    <button className="go-action-btn go-action-btn--ghost" disabled={busy}
                        onClick={() => setShowPickupDate(true)}>
                        {t.goSetPickupDate}
                    </button>
                </>
            )}

            {/* Courier picker */}
            {(status === 'AcceptedGroupOrder' || status === 'CourierAssignedToPickUp') && showCourierPicker && (
                <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
                    <select className="go-select go-select--inline" value={selectedCourierId}
                        onChange={e => setSelectedCourierId(e.target.value)}>
                        <option value="">{t.goChooseCourierOption}</option>
                        {couriers.map(c => (
                            <option key={c.courierId} value={c.courierId}>
                                {c.fullName} — {c.assignedCity}, {c.assignedDistrict}
                            </option>
                        ))}
                    </select>
                    <button className="go-action-btn go-action-btn--accept"
                        disabled={!selectedCourierId || busy} onClick={handleAssignGroupCourier}>
                        {t.goConfirm}
                    </button>
                    <button className="go-action-btn go-action-btn--ghost"
                        onClick={() => { setShowCourierPicker(false); setSelectedCourierId(''); }}>
                        {t.cancel}
                    </button>
                </div>
            )}

            {/* Pickup date picker */}
            {showPickupDate && (
                <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
                    <input
                        type="date"
                        className="go-select go-select--inline"
                        value={pickupDateValue}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setPickupDateValue(e.target.value)}
                    />
                    <button className="go-action-btn go-action-btn--accept"
                        disabled={!pickupDateValue || busy} onClick={handleSetPickupDate}>
                        {t.goSaveDate}
                    </button>
                    <button className="go-action-btn go-action-btn--ghost"
                        onClick={() => { setShowPickupDate(false); setPickupDateValue(''); }}>
                        {t.cancel}
                    </button>
                </div>
            )}

            {/* Step 6: Accept batch in warehouse */}
            {status === 'DeliveredToWarehouse' && (
                <button className="go-action-btn go-action-btn--warehouse" disabled={busy}
                    onClick={() => run(() => acceptGroupOrderInWarehouse(token, groupOrder.id), t.goAcceptedInWarehouse)}>
                    {t.goAcceptInWarehouse}
                </button>
            )}

            {status === 'AdminAcceptedOrderInWareHouse' && (
                <span className="go-action-hint">{t.goAssignPackagesHint}</span>
            )}

            {/* Cancel by Admin — always visible unless already terminal */}
            {!isCancelledOrDone && (
                <button
                    className="go-action-btn go-action-btn--cancel-admin"
                    disabled={busy}
                    title="Cancel this entire group order"
                    onClick={() => {
                        if (!window.confirm(t.goCancelGroupConfirm)) return;
                        run(() => cancelGroupOrderByAdmin(token, groupOrder.id), t.goGroupCancelled);
                    }}
                >
                    {t.goCancelGroup}
                </button>
            )}
        </div>
    );
}

// ── Per-order action cell ─────────────────────────────────────────────────────

interface OrderActionProps {
    order: AdminGroupOrder['orders'][0];
    storeName: string;
    couriers: Courier[];
    token: string;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
    onRefresh: () => void;
}

export function AdminOrderRowActions({ order, storeName, token, onSuccess, onError, onRefresh }: OrderActionProps) {
    const [busy, setBusy] = useState(false);
    const { t } = useLanguage();

    async function run(fn: () => Promise<void>, msg: string) {
        setBusy(true);
        try {
            await fn();
            onSuccess(msg);
            onRefresh();
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : t.goActionFailed);
        } finally {
            setBusy(false);
        }
    }

    const { status, recipientCity } = order;
    const isTbilisi = recipientCity.toLowerCase() === 'tbilisi';
    const isTerminal = status === 'DeliveredToRecipient' || status === 'CancelledByAdmin' || status === 'CancelledBySender';

    return (
        <div className="go-actions" onClick={e => e.stopPropagation()}>
            {/* Print this single package's label — always available. */}
            <button
                type="button"
                className="go-action-btn go-action-btn--ghost"
                title={t.custLabelBtn}
                onClick={() => void printParcelLabels([buildLabel(storeName, order)])}
            >
                {printIcon}
                {t.custLabelBtn}
            </button>

            {/* Step 7: non-Tbilisi → Send to City */}
            {status === 'AdminAcceptedOrderInWareHouse' && !isTbilisi && (
                <button className="go-action-btn go-action-btn--city" disabled={busy}
                    onClick={() => run(() => sendOrderToCity(token, order.id), t.goSentToCity(recipientCity))}>
                    {t.goSendToCity(recipientCity)}
                </button>
            )}

            {/* Cancel single order by Admin — always available unless terminal */}
            {!isTerminal && (
                <button
                    className="go-action-btn go-action-btn--cancel-admin"
                    disabled={busy}
                    title={t.goCancelPackageTitle}
                    onClick={() => {
                        if (!window.confirm(t.goCancelPackageConfirm)) return;
                        run(() => cancelOrderByAdmin(token, order.id), t.goOrderCancelled);
                    }}
                >
                    {t.goCancelPackage}
                </button>
            )}
        </div>
    );
}

