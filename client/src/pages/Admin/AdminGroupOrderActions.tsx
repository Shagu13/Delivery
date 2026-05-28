import { useState } from 'react';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
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

            {/* Step 1b: Set pickup date (after accepting) */}
            {status === 'AcceptedGroupOrder' && !showCourierPicker && !showPickupDate && (
                <>
                    <button className="go-action-btn go-action-btn--assign" disabled={busy}
                        onClick={() => setShowCourierPicker(true)}>
                        {t.goAssignCourierBtn}
                    </button>
                    <button className="go-action-btn go-action-btn--ghost" disabled={busy}
                        onClick={() => setShowPickupDate(true)}>
                        {t.goSetPickupDate}
                    </button>
                </>
            )}

            {/* Courier picker */}
            {status === 'AcceptedGroupOrder' && showCourierPicker && (
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
    couriers: Courier[];
    token: string;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
    onRefresh: () => void;
}

export function AdminOrderRowActions({ order, token, onSuccess, onError, onRefresh }: OrderActionProps) {
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

