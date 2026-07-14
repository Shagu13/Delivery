import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    fetchReturnExchangeOrders,
    assignReturnCourier,
    markReturnedToSender,
    setReturnStatus,
    RETURN_FLOW_STATUSES,
    type ReturnExchangeOrder,
    type ReturnFlowStatus,
} from '../../api/returnExchange';
import { setCourierSalary, setCompanyServicePrice, assignCourierToOrder } from '../../api/orders';
import type { Courier } from '../../api/couriers';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { SalaryWarningModal } from './SalaryWarningModal';
import { PriceWarningModal } from './PriceWarningModal';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
    Pending:                             '#f59e0b',
    CourierAssignedToPickUp:             '#3b82f6',
    PickedUpFromRecipient:               '#8b5cf6',
    DeliveredReturnOrderToWarehouse:     '#f97316',
    ReturnedToSender:                    '#10b981',
    CourierAssignedToDeliver:            '#3b82f6',
    CourierDeliveringTheOrderToRecipient:'#8b5cf6',
    DeliveredToRecipient:                '#10b981',
    ExchangeCompleted:                   '#10b981',
    CancelledByAdmin:                    '#ef4444',
};

type FilterType = 'All' | 'Return' | 'Exchange';
type FilterStatus = 'All' | 'Pending' | 'PickedUp' | 'AtWarehouse' | 'Completed';

const TERMINAL_STATUSES = new Set(['ReturnedToSender', 'ExchangeCompleted', 'DeliveredToRecipient', 'CancelledByAdmin']);

// A Return is "done" (no more courier assignment) once returned to sender or cancelled
// (by admin or by the customer before pickup).
const RETURN_TERMINAL_STATUSES = new Set<string>(['ReturnedToSender', 'CancelledByAdmin', 'CancelledBySender']);

// An Exchange runs the Send last-mile flow, so a DELIVERY courier is assignable where the
// Delivery/Packages page allows it (AssignCourierToOrderCommand's valid statuses) — plus,
// on this page, straight from the batch-accepted state (AcceptedOrder), letting an admin
// assign an Exchange without first running it through the pickup + warehouse ceremony.
const EXCHANGE_ASSIGNABLE_STATUSES = new Set<string>([
    'AcceptedOrder',
    'AdminAcceptedOrderInWareHouse',
    'OrderIsOnItsWayToRecipientsCity',
    'CourierAssignedToDeliver',
    'CourierDeliveringTheOrderToRecipient',
    'DeliveryPostponed',
]);

function isCompleted(o: ReturnExchangeOrder) {
    return TERMINAL_STATUSES.has(o.status);
}

// Client-side pagination: cap how many rows render at once.
const RE_PAGE_SIZE = 50;

// Search scope: match the typed term against the sender side (customer name/phone) or the
// recipient side (name/phone/city/district/address). Tracking number matches under either
// scope — it's an identifier, not a party field. (All orders are loaded, so this is local.)
function matchesReSearch(o: ReturnExchangeOrder, term: string, party: 'sender' | 'recipient'): boolean {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    if (o.trackingNumber.toLowerCase().includes(q)) return true;
    if (party === 'sender') {
        return (o.senderName ?? '').toLowerCase().includes(q)
            || (o.senderPhone ?? '').toLowerCase().includes(q);
    }
    return [
        o.recipientName, o.recipientPhone, o.recipientCity, o.recipientDistrict, o.recipientAddress,
        o.returnPickupCity, o.returnPickupDistrict, o.returnPickupAddress,
    ].some(f => (f ?? '').toLowerCase().includes(q));
}

function matchesStatusFilter(o: ReturnExchangeOrder, f: FilterStatus): boolean {
    if (f === 'All') return true;
    if (f === 'Pending') return o.status === 'Pending' || o.status === 'CourierAssignedToPickUp';
    if (f === 'PickedUp') return o.status === 'PickedUpFromRecipient';
    if (f === 'AtWarehouse') return o.status === 'DeliveredReturnOrderToWarehouse';
    if (f === 'Completed') return isCompleted(o);
    return true;
}

function fmt(iso: string | null, lang: 'en' | 'ka') {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(lang === 'ka' ? 'ka-GE' : 'en-GB',
        { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const { t } = useLanguage();
    const labelMap: Record<string, string> = {
        Pending:                              t.reStPending,
        CourierAssignedToPickUp:              t.reStCourierAssigned,
        PickedUpFromRecipient:                t.reStPickedUp,
        DeliveredReturnOrderToWarehouse:      t.reStAtWarehouse,
        ReturnedToSender:                     t.reStReturned,
        CourierAssignedToDeliver:             t.reStCourierAssigned,
        CourierDeliveringTheOrderToRecipient: t.reStDelivering,
        DeliveredToRecipient:                 t.reStDelivered,
        ExchangeCompleted:                    t.reStCompleted,
        CancelledByAdmin:                     t.reStCancelled,
    };
    const color = STATUS_COLOR[status] ?? 'var(--color-text-subtle)';
    const label = labelMap[status] ?? status;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 99,
            fontSize: '0.72rem', fontWeight: 700,
            background: `${color}18`, color, border: `1px solid ${color}40`,
            whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    );
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: 'Return' | 'Exchange' }) {
    const { t } = useLanguage();
    const color = type === 'Return' ? '#ef4444' : '#3b82f6';
    return (
        <span style={{
            display: 'inline-block', padding: '1px 7px', borderRadius: 99,
            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em',
            textTransform: 'uppercase', background: `${color}15`,
            color, border: `1px solid ${color}40`,
        }}>
            {type === 'Return' ? t.reTypeReturn : t.reTypeExchange}
        </span>
    );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function Pill({ label, active, count, onClick }: {
    label: string; active: boolean; count?: number; onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                padding: '5px 14px', borderRadius: 99,
                border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: active ? 'var(--color-accent-dim)' : 'transparent',
                color: active ? 'var(--color-accent)' : 'var(--color-text-subtle)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
            }}
        >
            {label}
            {count !== undefined && (
                <span style={{
                    background: active ? 'var(--color-accent)' : 'var(--color-bg-3)',
                    color: active ? '#fff' : 'var(--color-text-subtle)',
                    borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                    padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>
                    {count}
                </span>
            )}
        </button>
    );
}

// ── Row component ─────────────────────────────────────────────────────────────

function OrderRow({
    order, couriers, token, onRefresh,
}: {
    order: ReturnExchangeOrder;
    couriers: Courier[];
    token: string;
    onRefresh: () => void;
}) {
    const { t, lang } = useLanguage();
    const [assigning, setAssigning]         = useState(false);
    const [completing, setCompleting]       = useState(false);
    const [settingStatus, setSettingStatus] = useState(false);
    const [selectedCourier, setSelected]    = useState(order.courierId ?? '');
    const [rowError, setRowError]           = useState<string | null>(null);
    const [showSalaryWarning, setShowSalaryWarning] = useState(false);
    const [showSalaryModal, setShowSalaryModal]     = useState(false);
    const [salaryInput, setSalaryInput]             = useState('');
    const [salarySaving, setSalarySaving]           = useState(false);
    const [showPriceWarning, setShowPriceWarning]   = useState(false);
    const [showPriceModal, setShowPriceModal]       = useState(false);
    const [priceInput, setPriceInput]               = useState('');
    const [priceSaving, setPriceSaving]             = useState(false);

    const doAssign = async () => {
        setAssigning(true); setRowError(null);
        try {
            // Returns use the standalone-pickup assign; Exchanges use the standard last-mile
            // delivery assign (same command the Delivery/Packages page uses).
            if (order.orderType === 'Return') {
                await assignReturnCourier(token, order.id, selectedCourier);
            } else {
                await assignCourierToOrder(token, order.id, selectedCourier);
            }
            onRefresh();
        } catch (e) {
            setRowError(e instanceof Error ? e.message : t.reActionFailed);
        } finally { setAssigning(false); }
    };

    const handleAssign = async () => {
        if (!selectedCourier) return;
        // Require a service price first (mirrors the salary requirement), then salary.
        if (!order.companyServicePrice) {
            setShowPriceWarning(true);
            return;
        }
        if (order.courierSalary == null) {
            setShowSalaryWarning(true);
            return;
        }
        await doAssign();
    };

    const handleSalarySave = async () => {
        const val = parseFloat(salaryInput);
        if (isNaN(val) || val < 0) return;
        setSalarySaving(true);
        try {
            await setCourierSalary(token, order.id, val);
        } catch { /* best-effort */ }
        setSalarySaving(false);
        setShowSalaryModal(false);
        await doAssign();
    };

    const handlePriceSave = async () => {
        const val = parseFloat(priceInput);
        if (isNaN(val) || val < 0) return;
        setPriceSaving(true);
        try {
            await setCompanyServicePrice(token, order.id, val);
        } catch { /* best-effort */ }
        setPriceSaving(false);
        setShowPriceModal(false);
        // Price is now set — continue the assign flow: salary next, else assign.
        if (order.courierSalary == null) {
            setShowSalaryWarning(true);
        } else {
            await doAssign();
        }
    };

    const handleMarkReturned = async () => {
        setCompleting(true); setRowError(null);
        try {
            await markReturnedToSender(token, order.id);
            onRefresh();
        } catch (e) {
            setRowError(e instanceof Error ? e.message : t.reActionFailed);
        } finally { setCompleting(false); }
    };

    const handleSetStatus = async (newStatus: ReturnFlowStatus) => {
        if (newStatus === order.status) return;
        setSettingStatus(true); setRowError(null);
        try {
            await setReturnStatus(token, order.id, newStatus);
            onRefresh();
        } catch (e) {
            setRowError(e instanceof Error ? e.message : t.reActionFailed);
        } finally { setSettingStatus(false); }
    };

    // A Return can be (re)assigned a courier in any active status — not just Pending —
    // so an admin can attach or change the courier at any point up to the terminal states.
    // An Exchange (Send last-mile flow) can be assigned a delivery courier exactly where the
    // Delivery/Packages page allows it.
    const canAssignReturn   = order.orderType === 'Return'   && !RETURN_TERMINAL_STATUSES.has(order.status);
    const canAssignExchange = order.orderType === 'Exchange' && EXCHANGE_ASSIGNABLE_STATUSES.has(order.status);
    const canAssign = canAssignReturn || canAssignExchange;

    // An Exchange has no warehouse leg; once it's delivered the admin can confirm the
    // swapped-out item went back to the sender (its own terminal), same endpoint as returns.
    const canMarkExchangeReturned = order.orderType === 'Exchange' &&
        (order.status === 'DeliveredToRecipient' || order.status === 'ExchangeCompleted');

    // Full status override for Return orders: admin can jump the parcel to any status in
    // its flow (fills the gaps left by the step-by-step courier/admin actions).
    const returnStatusLabels: Record<ReturnFlowStatus, string> = {
        Pending:                         t.reStPending,
        CourierAssignedToPickUp:         t.reStCourierAssigned,
        PickedUpFromRecipient:           t.reStPickedUp,
        DeliveredReturnOrderToWarehouse: t.reStAtWarehouse,
        ReturnedToSender:                t.reStReturned,
        CancelledByAdmin:                t.reStCancelled,
    };
    const statusInFlow = (RETURN_FLOW_STATUSES as string[]).includes(order.status);

    const done = isCompleted(order);

    return (
        <tr style={{ opacity: done ? 0.6 : 1 }}>
            <td>
                <span className="tn-badge" style={{ fontSize: '0.75rem' }}>{order.trackingNumber}</span>
            </td>
            <td><TypeBadge type={order.orderType} /></td>
            <td>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{order.senderName}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', fontFamily: 'monospace' }}>
                    {order.senderPhone}
                </div>
            </td>
            <td>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                    {recipientDisplayName(order.recipientName, t.recipientUnknown)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', fontFamily: 'monospace' }}>
                    {order.recipientPhone}
                </div>
            </td>
            <td style={{ fontSize: '0.8rem' }}>
                {order.orderType === 'Return' && order.returnPickupCity ? (
                    <>
                        <div style={{ fontWeight: 600 }}>{order.returnPickupCity}</div>
                        <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.72rem' }}>
                            {order.returnPickupDistrict}
                        </div>
                        <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.72rem' }}>
                            {order.returnPickupAddress}
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontWeight: 600 }}>{order.recipientCity}</div>
                        <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.72rem' }}>
                            {order.recipientDistrict}
                        </div>
                    </>
                )}
            </td>
            <td><StatusBadge status={order.status} /></td>
            <td style={{ fontSize: '0.8rem' }}>
                {order.courierFullName
                    ? <div style={{ fontWeight: 600 }}>{order.courierFullName}</div>
                    : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>{t.reUnassigned}</span>}
            </td>
            <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                {fmt(order.createdAt, lang)}
            </td>
            <td>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minWidth: 180 }}>
                    {canAssign && (
                        <>
                            <select
                                value={selectedCourier}
                                onChange={e => setSelected(e.target.value)}
                                style={{
                                    background: 'var(--color-bg)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--color-text)',
                                    fontSize: '0.78rem', padding: '4px 8px',
                                    minWidth: 120,
                                }}
                            >
                                <option value="">{t.rePickCourier}</option>
                                {couriers.filter(c => !c.isDeleted).map(c => (
                                    <option key={c.courierId} value={c.courierId}>{c.fullName}</option>
                                ))}
                            </select>
                            <button
                                className="go-action-btn go-action-btn--assign"
                                onClick={handleAssign}
                                disabled={!selectedCourier || assigning}
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            >
                                {assigning ? '…' : t.reAssign}
                            </button>
                        </>
                    )}
                    {order.orderType === 'Return' && (
                        <select
                            value={order.status}
                            onChange={e => void handleSetStatus(e.target.value as ReturnFlowStatus)}
                            disabled={settingStatus}
                            title={t.reSetStatus}
                            style={{
                                background: 'var(--color-bg)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--color-text)',
                                fontSize: '0.78rem', padding: '4px 8px',
                                minWidth: 150, opacity: settingStatus ? 0.6 : 1,
                            }}
                        >
                            {!statusInFlow && (
                                <option value={order.status} disabled>{order.status}</option>
                            )}
                            {RETURN_FLOW_STATUSES.map(s => (
                                <option key={s} value={s}>{returnStatusLabels[s]}</option>
                            ))}
                        </select>
                    )}
                    {canMarkExchangeReturned && (
                        <button
                            className="go-action-btn"
                            onClick={handleMarkReturned}
                            disabled={completing}
                            style={{
                                fontSize: '0.75rem', padding: '4px 10px',
                                background: 'rgba(16,185,129,0.1)',
                                color: '#10b981',
                                border: '1px solid rgba(16,185,129,0.3)',
                            }}
                        >
                            {completing ? '…' : t.reMarkReturned}
                        </button>
                    )}
                    {rowError && (
                        <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>{rowError}</span>
                    )}
                </div>
            </td>

            {/* Service-price warning */}
            {showPriceWarning && (
                <PriceWarningModal
                    orderCount={1}
                    onCancel={() => setShowPriceWarning(false)}
                    onFillPrices={() => { setShowPriceWarning(false); setPriceInput(''); setShowPriceModal(true); }}
                />
            )}

            {/* Service-price modal portal */}
            {showPriceModal && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>{t.rePriceTitle}</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                                    <span className="tn-badge" style={{ fontSize: '0.75rem' }}>{order.trackingNumber}</span>
                                </div>
                            </div>
                            <button onClick={() => setShowPriceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>{t.rePriceLabel}</span>
                            <input
                                type="number" min="0" step="0.01" placeholder="0.00"
                                autoFocus
                                value={priceInput}
                                onChange={e => setPriceInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void handlePriceSave(); if (e.key === 'Escape') setShowPriceModal(false); }}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.88rem', outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button onClick={() => setShowPriceModal(false)} disabled={priceSaving} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.cancel}</button>
                            <button onClick={handlePriceSave} disabled={priceSaving || !priceInput} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (priceSaving || !priceInput) ? 0.6 : 1 }}>
                                {priceSaving ? t.reSaving : t.rePriceSaveContinue}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Salary warning */}
            {showSalaryWarning && (
                <SalaryWarningModal
                    orderCount={1}
                    onCancel={() => setShowSalaryWarning(false)}
                    onFillSalaries={() => { setShowSalaryWarning(false); setSalaryInput(''); setShowSalaryModal(true); }}
                />
            )}

            {/* Salary modal portal */}
            {showSalaryModal && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>{t.reSalaryTitle}</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                                    <span className="tn-badge" style={{ fontSize: '0.75rem' }}>{order.trackingNumber}</span>
                                    {order.senderName && <span style={{ marginLeft: 8 }}>{order.senderName}</span>}
                                </div>
                            </div>
                            <button onClick={() => setShowSalaryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>{t.reSalaryLabel}</span>
                            <input
                                type="number" min="0" step="0.01" placeholder="0.00"
                                autoFocus
                                value={salaryInput}
                                onChange={e => setSalaryInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void handleSalarySave(); if (e.key === 'Escape') setShowSalaryModal(false); }}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.88rem', outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button onClick={() => setShowSalaryModal(false)} disabled={salarySaving} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.cancel}</button>
                            <button onClick={handleSalarySave} disabled={salarySaving || !salaryInput} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (salarySaving || !salaryInput) ? 0.6 : 1 }}>
                                {salarySaving ? t.reSaving : t.reSalarySaveAssign}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </tr>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
    token: string;
    couriers: Courier[];
    onBack: () => void;
}

export default function AdminReturnExchangePage({ token, couriers, onBack }: Props) {
    const { t } = useLanguage();
    const [orders, setOrders]         = useState<ReturnExchangeOrder[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<FilterType>('All');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');
    const [search, setSearch]         = useState('');
    const [searchParty, setSearchParty] = useState<'sender' | 'recipient'>('sender');
    const [page, setPage]             = useState(1);

    const load = useCallback(async (silent = false) => {
        if (!silent) { setLoading(true); setError(null); }
        try {
            const data = await fetchReturnExchangeOrders(token);
            setOrders(data);
        } catch (e) {
            if (!silent) setError(e instanceof Error ? e.message : t.reLoadFailed);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [token, t]);

    useEffect(() => { void load(); }, [load]);

    // Live refresh: a new return/exchange placed by a customer (or a status/assignment
    // change) pushes 'adminOrdersChanged' — refetch silently so it appears immediately.
    useOrdersChangedSignal(token, 'adminOrdersChanged', () => { void load(true); });

    // Search narrows the working set first; the type/status pill counts and the table all
    // derive from it, so the numbers always match what's shown.
    const searchedOrders = orders.filter(o => matchesReSearch(o, search, searchParty));

    const filtered = searchedOrders.filter(o => {
        if (typeFilter !== 'All' && o.orderType !== typeFilter) return false;
        return matchesStatusFilter(o, statusFilter);
    });

    const countFor = (sf: FilterStatus) =>
        searchedOrders.filter(o => {
            if (typeFilter !== 'All' && o.orderType !== typeFilter) return false;
            return matchesStatusFilter(o, sf);
        }).length;

    const returnCount   = searchedOrders.filter(o => o.orderType === 'Return').length;
    const exchangeCount = searchedOrders.filter(o => o.orderType === 'Exchange').length;

    // ── Pagination ──────────────────────────────────────────────────────────────
    useEffect(() => { setPage(1); }, [search, searchParty, typeFilter, statusFilter]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / RE_PAGE_SIZE));
    const safePage   = Math.min(page, totalPages);
    const pageStart  = (safePage - 1) * RE_PAGE_SIZE;
    const paged      = filtered.slice(pageStart, pageStart + RE_PAGE_SIZE);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                    type="button"
                    onClick={onBack}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                        color: 'var(--color-text-subtle)', fontSize: '0.8rem', fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {t.reBack}
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                        ↩ {t.reTitle}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                        {t.reSubtitle}
                    </p>
                </div>
            </div>

            {/* Search + scope toggle */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
                    {(['sender', 'recipient'] as const).map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setSearchParty(p)}
                            style={{
                                padding: '7px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                background: searchParty === p ? 'var(--color-accent)' : 'transparent',
                                color: searchParty === p ? '#fff' : 'var(--color-text-subtle)',
                            }}
                        >
                            {p === 'sender' ? t.goSender : t.goThRecipient}
                        </button>
                    ))}
                </div>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="var(--color-text-subtle)" strokeWidth="1.4"/>
                        <path d="M10 10l3 3" stroke="var(--color-text-subtle)" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t.goSearchPh}
                        autoComplete="off"
                        style={{
                            width: '100%', padding: '9px 32px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                            color: 'var(--color-text)', fontSize: '0.85rem', fontFamily: 'var(--font-body)',
                            boxSizing: 'border-box',
                        }}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            aria-label="Clear search"
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--color-bg-3)', color: 'var(--color-text-subtle)' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Type filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.reTypeLabel}</span>
                {([
                    ['All',      t.reFilterAll],
                    ['Return',   t.reFilterReturn],
                    ['Exchange', t.reFilterExchange],
                ] as [FilterType, string][]).map(([f, label]) => (
                    <Pill
                        key={f}
                        label={label}
                        active={typeFilter === f}
                        count={f === 'All' ? searchedOrders.length : f === 'Return' ? returnCount : exchangeCount}
                        onClick={() => setTypeFilter(f)}
                    />
                ))}
            </div>

            {/* Status filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.reStatusLabel}</span>
                {([
                    ['All',         t.reFilterAll],
                    ['Pending',     t.reFilterPending],
                    ['PickedUp',    t.reFilterPickedUp],
                    ['AtWarehouse', t.reFilterAtWarehouse],
                    ['Completed',   t.reFilterCompleted],
                ] as [FilterStatus, string][]).map(([f, label]) => (
                    <Pill
                        key={f}
                        label={label}
                        active={statusFilter === f}
                        count={f !== 'All' ? countFor(f) : undefined}
                        onClick={() => setStatusFilter(f)}
                    />
                ))}
            </div>

            {/* Table */}
            {loading && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
                    <div className="go-spinner" style={{ margin: '0 auto 8px' }} />
                    {t.loading}
                </div>
            )}
            {error && (
                <div style={{ padding: 16, color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.85rem' }}>
                    {error}
                </div>
            )}
            {!loading && !error && filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
                    {t.reNoOrders}
                </div>
            )}
            {!loading && !error && filtered.length > 0 && (
                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <table className="go-orders-table" style={{ minWidth: 900 }}>
                        <thead>
                            <tr>
                                <th>{t.reThTracking}</th>
                                <th>{t.reThType}</th>
                                <th>{t.reThSender}</th>
                                <th>{t.reThRecipient}</th>
                                <th>{t.reThPickupCity}</th>
                                <th>{t.reThStatus}</th>
                                <th>{t.reThCourier}</th>
                                <th>{t.reThCreated}</th>
                                <th>{t.reThActions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map(o => (
                                <OrderRow
                                    key={o.id}
                                    order={o}
                                    couriers={couriers}
                                    token={token}
                                    onRefresh={() => void load(true)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination — rendered rows are capped at RE_PAGE_SIZE. */}
            {!loading && !error && filtered.length > RE_PAGE_SIZE && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        style={{
                            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)', background: 'var(--color-bg-3)',
                            color: 'var(--color-text)', fontSize: '0.8rem', fontWeight: 600,
                            cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.5 : 1,
                        }}
                    >
                        {t.histPrevPage}
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
                        {pageStart + 1}–{Math.min(pageStart + RE_PAGE_SIZE, filtered.length)} / {filtered.length}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        style={{
                            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)', background: 'var(--color-bg-3)',
                            color: 'var(--color-text)', fontSize: '0.8rem', fontWeight: 600,
                            cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages ? 0.5 : 1,
                        }}
                    >
                        {t.histNextPage}
                    </button>
                </div>
            )}
        </div>
    );
}
