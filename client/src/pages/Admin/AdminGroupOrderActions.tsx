import { useState } from 'react';
import { createPortal } from 'react-dom';
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
import { assignReturnCourier } from '../../api/returnExchange';
import type { Courier } from '../../api/couriers';
import { useLanguage } from '../../contexts/useLanguage';
import { printParcelLabels, type ParcelLabelData } from '../../utils/printLabel';
import { recipientDisplayName } from '../../utils/recipientName';

// Print icon shared by the label buttons.
const printIcon = (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M4.5 6V2.5h7V6M4.5 11.5h-1A1.5 1.5 0 0 1 2 10V8a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 8v2a1.5 1.5 0 0 1-1.5 1.5h-1M4.5 9.5h7v4h-7z"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Amount the recipient pays — matches what the courier actually collects: COD (only when
// not prepaid) + the company service fee whenever the recipient pays it. The fee is added
// even when the price was entered all-in, because the backend stores amountToCollectForPackage
// as the product-only portion (gross − fee), so the fee must be added back for the total.
function recipientAmountDue(o: AdminOrder): number {
    const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
    const fee = o.whoPaysForCompanyService === 'Recipient' ? (o.companyServicePrice ?? 0) : 0;
    return cod + fee;
}

// Build the Georgian parcel-sticker payload for one package of a group order.
function buildLabel(storeName: string, o: AdminOrder): ParcelLabelData {
    const due = recipientAmountDue(o);
    const city     = o.recipientCityGeo     || o.recipientCity;
    const district = o.recipientDistrictGeo || o.recipientDistrict;
    return {
        storeName,
        recipientName:    recipientDisplayName(o.recipientName, 'უცნობი'),
        recipientPhone:   o.recipientPhone,
        recipientAddress: [o.recipientAddress, district, city].filter(Boolean).join(', '),
        amountText:       due > 0.005 ? `₾${due.toFixed(2)}` : 'გადახდილია',
        description:      o.description ?? undefined,
        trackingNumber:   o.trackingNumber,
    };
}


// A styled yes/no confirmation popup (replaces the browser's native window.confirm).
// Self-contained inline styles + the global go-action-btn button classes; portaled to
// <body> so it centers over the viewport regardless of the card's overflow/transform.
function ConfirmDialog({ title, message, confirmLabel, confirmTone, busy, onConfirm, onCancel, cancelLabel, body, confirmDisabled = false }: {
    title: string;
    message: string;
    confirmLabel: string;
    confirmTone: string;      // go-action-btn modifier, e.g. 'warehouse' | 'cancel-admin'
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    cancelLabel: string;
    body?: React.ReactNode;   // optional extra content (e.g. a courier picker)
    confirmDisabled?: boolean;
}) {
    return createPortal(
        <div
            onClick={() => { if (!busy) onCancel(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.45)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
            <div
                role="dialog" aria-modal="true"
                onClick={e => e.stopPropagation()}
                style={{ width: 'min(420px, 100%)', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}
            >
                <div style={{ padding: '20px 22px 0' }}>
                    <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)' }}>{title}</h3>
                    <p style={{ margin: '8px 0 0', fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text-muted)' }}>{message}</p>
                    {body && <div style={{ marginTop: 14 }}>{body}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '18px 22px 20px' }}>
                    <button className="go-action-btn go-action-btn--ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
                    <button className={`go-action-btn go-action-btn--${confirmTone}`} onClick={onConfirm} disabled={busy || confirmDisabled}>{confirmLabel}</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

interface Props {
    groupOrder: AdminGroupOrder;
    couriers: Courier[];
    token: string;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
    onRefresh: () => void;
    // Operators get a restricted view: they may accept a pending batch and assign a
    // pickup courier (canAssignCourier), but every other lifecycle action
    // (warehouse, decline, cancel, set pickup date…) is hidden.
    canManage?: boolean;
    // Whether the pickup-courier assign/reassign UI is shown. Defaults to canManage;
    // Operators get it enabled while canManage stays false.
    canAssignCourier?: boolean;
    // Warehouse partial-accept (DeliveredToWarehouse only). `warehousePresentIds` lists the
    // packages ticked as present; `warehouseAbsentCount` is how many were unticked (missing).
    // When some are missing, accepting confirms and cancels them as "not received". Left
    // undefined elsewhere, where the accept button keeps its all-or-nothing behaviour.
    warehousePresentIds?: string[];
    warehouseAbsentCount?: number;
}

export function AdminGroupOrderActions({ groupOrder, couriers, token, onSuccess, onError, onRefresh, canManage = true, canAssignCourier = canManage, warehousePresentIds, warehouseAbsentCount }: Props) {
    const [busy, setBusy] = useState(false);
    const [showCourierPicker, setShowCourierPicker] = useState(false);
    const [selectedCourierId, setSelectedCourierId] = useState('');
    const [showPickupDate, setShowPickupDate] = useState(false);
    const [pickupDateValue, setPickupDateValue] = useState('');
    // Pending confirmation shown in a styled popup instead of window.confirm.
    const [confirm, setConfirm] = useState<null | {
        title: string; message: string; confirmLabel: string; confirmTone: string; action: () => void;
    }>(null);
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

    // A standalone Return order is surfaced here as a synthetic single-order "batch"
    // whose id is the Order id (no GroupOrder exists). Its pickup courier lives on
    // Order.CourierId and must be (re)assigned through the Return endpoint — the
    // group-order route would 404 on the order id.
    const isStandaloneReturn =
        groupOrder.isStandalone === true && groupOrder.orders[0]?.orderType === 'Return';

    async function handleAssignGroupCourier() {
        if (!selectedCourierId) return;
        await run(
            () => isStandaloneReturn
                ? assignReturnCourier(token, groupOrder.id, selectedCourierId)
                : assignCourierToGroupOrder(token, groupOrder.id, selectedCourierId),
            t.goAssignedPickup
        );
        setShowCourierPicker(false);
        setSelectedCourierId('');
    }

    // Accept the batch in warehouse. With a per-package selection, accept only the present
    // packages and cancel the missing ones — confirm first so the cancellations are deliberate.
    function handleAcceptInWarehouse() {
        const accept = (ids?: string[]) =>
            run(() => acceptGroupOrderInWarehouse(token, groupOrder.id, ids), t.goAcceptedInWarehouse);

        // No per-package selection supplied → accept the whole batch (legacy behaviour).
        if (warehousePresentIds === undefined) { accept(); return; }

        if (warehousePresentIds.length === 0) { onError(t.goWarehouseNonePresent); return; }

        if ((warehouseAbsentCount ?? 0) > 0) {
            setConfirm({
                title: t.goWarehouseAcceptTitle,
                message: t.goWarehousePartialConfirm(warehousePresentIds.length, warehouseAbsentCount ?? 0),
                confirmLabel: t.goAcceptInWarehouse,
                confirmTone: 'warehouse',
                action: () => accept(warehousePresentIds),
            });
        } else {
            accept(warehousePresentIds);
        }
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

            {/* Step 1: Accept or Decline pending order. Operators may only Accept. */}
            {status === 'Pending' && (
                <>
                    <button className="go-action-btn go-action-btn--accept" disabled={busy}
                        onClick={() => run(() => acceptGroupOrder(token, groupOrder.id), t.goGroupAccepted)}>
                        {t.goAccept}
                    </button>
                    {canManage && (
                        <button className="go-action-btn go-action-btn--decline" disabled={busy}
                            onClick={() => run(() => declineGroupOrder(token, groupOrder.id), t.goGroupDeclined)}>
                            {t.goDecline}
                        </button>
                    )}
                </>
            )}

            {/* Step 1b: Assign courier / set pickup date. Shown while awaiting pickup —
                AcceptedGroupOrder (first assignment) and CourierAssignedToPickUp (re-assign).
                Operators may assign the courier; setting the pickup date stays Admin-only. */}
            {canAssignCourier && (status === 'AcceptedGroupOrder' || status === 'CourierAssignedToPickUp') && !showCourierPicker && !showPickupDate && (
                <>
                    <button className="go-action-btn go-action-btn--assign" disabled={busy}
                        onClick={() => setShowCourierPicker(true)}>
                        {status === 'CourierAssignedToPickUp' ? t.goReassignCourierBtn : t.goAssignCourierBtn}
                    </button>
                    {canManage && (
                        <button className="go-action-btn go-action-btn--ghost" disabled={busy}
                            onClick={() => setShowPickupDate(true)}>
                            {t.goSetPickupDate}
                        </button>
                    )}
                </>
            )}

            {/* Courier picker */}
            {canAssignCourier && (status === 'AcceptedGroupOrder' || status === 'CourierAssignedToPickUp') && showCourierPicker && (
                <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
                    <select className="go-select go-select--inline" value={selectedCourierId}
                        onChange={e => setSelectedCourierId(e.target.value)}>
                        <option value="">{t.goChooseCourierOption}</option>
                        {couriers.filter(c => !c.isDeleted).map(c => (
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
            {canManage && showPickupDate && (
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

            {/* Admin shortcut: force a batch straight to the warehouse from any earlier
                pickup stage (e.g. the sender dropped the packages off in person, no courier
                pickup). Skips the remaining steps; each package becomes ready for last-mile
                delivery. The normal DeliveredToWarehouse → Accept step keeps its own button. */}
            {canManage && (status === 'Pending' || status === 'AcceptedGroupOrder' ||
              status === 'CourierAssignedToPickUp' || status === 'CourierOnTheWayToPickUp' ||
              status === 'CourierDeliveringToWarehouse') &&
              !showCourierPicker && !showPickupDate && (
                <button className="go-action-btn go-action-btn--warehouse" disabled={busy}
                    title={t.goForceWarehouseConfirm}
                    onClick={() => {
                        // No pickup courier yet → confirm proceeding without one, no forced assignment.
                        setConfirm({
                            title: t.goForceWarehouseTitle,
                            message: groupOrder.courierId ? t.goForceWarehouseConfirm : t.goForceWarehouseNoCourierConfirm,
                            confirmLabel: t.goForceWarehouse,
                            confirmTone: 'warehouse',
                            action: () => run(() => acceptGroupOrderInWarehouse(token, groupOrder.id), t.goAcceptedInWarehouse),
                        });
                    }}>
                    {t.goForceWarehouse}
                </button>
            )}

            {/* Step 6: Accept batch in warehouse (only the ticked-present packages; missing ones cancelled) */}
            {canManage && status === 'DeliveredToWarehouse' && (
                <button className="go-action-btn go-action-btn--warehouse" disabled={busy}
                    onClick={handleAcceptInWarehouse}>
                    {t.goAcceptInWarehouse}
                </button>
            )}

            {canManage && status === 'AdminAcceptedOrderInWareHouse' && (
                <span className="go-action-hint">{t.goAssignPackagesHint}</span>
            )}

            {/* Cancel by Admin — always visible unless already terminal */}
            {canManage && !isCancelledOrDone && (
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

            {confirm && (
                <ConfirmDialog
                    title={confirm.title}
                    message={confirm.message}
                    confirmLabel={confirm.confirmLabel}
                    confirmTone={confirm.confirmTone}
                    cancelLabel={t.cancel}
                    busy={busy}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => { const act = confirm.action; setConfirm(null); act(); }}
                />
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
    onEdit?: () => void;
    // Operators may only print the label; edit / send-to-city / cancel are hidden.
    canManage?: boolean;
    // Hide the print-label button (e.g. the Delivery page surfaces it in the kebab menu instead).
    showLabel?: boolean;
}

export function AdminOrderRowActions({ order, storeName, token, onSuccess, onError, onRefresh, onEdit, canManage = true, showLabel = true }: OrderActionProps) {
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
            {/* Print this single package's label — hidden when the host surfaces it elsewhere. */}
            {showLabel && (
                <button
                    type="button"
                    className="go-action-btn go-action-btn--ghost"
                    title={t.custLabelBtn}
                    onClick={() => void printParcelLabels([buildLabel(storeName, order)])}
                >
                    {printIcon}
                    {t.custLabelBtn}
                </button>
            )}

            {/* Edit this package — opens the full order edit modal. */}
            {canManage && onEdit && (
                <button
                    type="button"
                    className="go-action-btn go-action-btn--ghost"
                    title={t.eomEyebrow}
                    onClick={onEdit}
                >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t.edit}
                </button>
            )}

            {/* Step 7: non-Tbilisi → Send to City */}
            {canManage && status === 'AdminAcceptedOrderInWareHouse' && !isTbilisi && (
                <button className="go-action-btn go-action-btn--city" disabled={busy}
                    onClick={() => run(() => sendOrderToCity(token, order.id), t.goSentToCity(recipientCity))}>
                    {t.goSendToCity(recipientCity)}
                </button>
            )}

            {/* Cancel single order by Admin — always available unless terminal */}
            {canManage && !isTerminal && (
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

