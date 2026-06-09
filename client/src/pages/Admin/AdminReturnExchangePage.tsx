import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    fetchReturnExchangeOrders,
    assignReturnCourier,
    markReturnedToSender,
    type ReturnExchangeOrder,
} from '../../api/returnExchange';
import { setCourierSalary } from '../../api/orders';
import type { Courier } from '../../api/couriers';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { SalaryWarningModal } from './SalaryWarningModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
    Pending:                             'Pending',
    CourierAssignedToPickUp:             'Courier Assigned',
    PickedUpFromRecipient:               'Picked Up',
    DeliveredReturnOrderToWarehouse:     'At Warehouse',
    ReturnedToSender:                    '✓ Returned',
    CourierAssignedToDeliver:            'Courier Assigned',
    CourierDeliveringTheOrderToRecipient:'Delivering',
    DeliveredToRecipient:                '✓ Delivered',
    ExchangeCompleted:                   '✓ Completed',
    CancelledByAdmin:                    '✗ Cancelled',
};

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

function isCompleted(o: ReturnExchangeOrder) {
    return TERMINAL_STATUSES.has(o.status);
}

function matchesStatusFilter(o: ReturnExchangeOrder, f: FilterStatus): boolean {
    if (f === 'All') return true;
    if (f === 'Pending') return o.status === 'Pending' || o.status === 'CourierAssignedToPickUp';
    if (f === 'PickedUp') return o.status === 'PickedUpFromRecipient';
    if (f === 'AtWarehouse') return o.status === 'DeliveredReturnOrderToWarehouse';
    if (f === 'Completed') return isCompleted(o);
    return true;
}

function fmt(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const color = STATUS_COLOR[status] ?? 'var(--color-text-subtle)';
    const label = STATUS_LABEL[status] ?? status;
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
    const color = type === 'Return' ? '#ef4444' : '#3b82f6';
    return (
        <span style={{
            display: 'inline-block', padding: '1px 7px', borderRadius: 99,
            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em',
            textTransform: 'uppercase', background: `${color}15`,
            color, border: `1px solid ${color}40`,
        }}>
            {type}
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
    const [assigning, setAssigning]         = useState(false);
    const [completing, setCompleting]       = useState(false);
    const [selectedCourier, setSelected]    = useState('');
    const [rowError, setRowError]           = useState<string | null>(null);
    const [showSalaryWarning, setShowSalaryWarning] = useState(false);
    const [showSalaryModal, setShowSalaryModal]     = useState(false);
    const [salaryInput, setSalaryInput]             = useState('');
    const [salarySaving, setSalarySaving]           = useState(false);

    const doAssign = async () => {
        setAssigning(true); setRowError(null);
        try {
            await assignReturnCourier(token, order.id, selectedCourier);
            onRefresh();
        } catch (e) {
            setRowError(e instanceof Error ? e.message : 'Failed');
        } finally { setAssigning(false); }
    };

    const handleAssign = async () => {
        if (!selectedCourier) return;
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

    const handleMarkReturned = async () => {
        setCompleting(true); setRowError(null);
        try {
            await markReturnedToSender(token, order.id);
            onRefresh();
        } catch (e) {
            setRowError(e instanceof Error ? e.message : 'Failed');
        } finally { setCompleting(false); }
    };

    const canAssign = order.orderType === 'Return' &&
        (order.status === 'Pending' || order.status === 'CourierAssignedToPickUp');

    const canMarkReturned = order.orderType === 'Return' &&
        order.status === 'DeliveredReturnOrderToWarehouse';

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
                    {order.recipientFirstName} {order.recipientLastName}
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
                    : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>Unassigned</span>}
            </td>
            <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                {fmt(order.createdAt)}
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
                                <option value="">Pick courier…</option>
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
                                {assigning ? '…' : 'Assign'}
                            </button>
                        </>
                    )}
                    {canMarkReturned && (
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
                            {completing ? '…' : '✓ Returned to Sender'}
                        </button>
                    )}
                    {rowError && (
                        <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>{rowError}</span>
                    )}
                </div>
            </td>

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
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>Set Courier Salary</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                                    <span className="tn-badge" style={{ fontSize: '0.75rem' }}>{order.trackingNumber}</span>
                                </div>
                            </div>
                            <button onClick={() => setShowSalaryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>Courier Salary ₾</span>
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
                            <button onClick={() => setShowSalaryModal(false)} disabled={salarySaving} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleSalarySave} disabled={salarySaving || !salaryInput} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (salarySaving || !salaryInput) ? 0.6 : 1 }}>
                                {salarySaving ? 'Saving…' : 'Save & Assign'}
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
    const [orders, setOrders]         = useState<ReturnExchangeOrder[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<FilterType>('All');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');

    const load = useCallback(async (silent = false) => {
        if (!silent) { setLoading(true); setError(null); }
        try {
            const data = await fetchReturnExchangeOrders(token);
            setOrders(data);
        } catch (e) {
            if (!silent) setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [token]);

    useEffect(() => { void load(); }, [load]);

    // Live refresh: a new return/exchange placed by a customer (or a status/assignment
    // change) pushes 'adminOrdersChanged' — refetch silently so it appears immediately.
    useOrdersChangedSignal(token, 'adminOrdersChanged', () => { void load(true); });

    const filtered = orders.filter(o => {
        if (typeFilter !== 'All' && o.orderType !== typeFilter) return false;
        return matchesStatusFilter(o, statusFilter);
    });

    const countFor = (sf: FilterStatus) =>
        orders.filter(o => {
            if (typeFilter !== 'All' && o.orderType !== typeFilter) return false;
            return matchesStatusFilter(o, sf);
        }).length;

    const returnCount   = orders.filter(o => o.orderType === 'Return').length;
    const exchangeCount = orders.filter(o => o.orderType === 'Exchange').length;

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
                    Back
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                        ↩ Returns &amp; Exchanges
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                        Manage return pickups and exchange deliveries
                    </p>
                </div>
            </div>

            {/* Type filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type:</span>
                {(['All', 'Return', 'Exchange'] as FilterType[]).map(f => (
                    <Pill
                        key={f}
                        label={f}
                        active={typeFilter === f}
                        count={f === 'All' ? orders.length : f === 'Return' ? returnCount : exchangeCount}
                        onClick={() => setTypeFilter(f)}
                    />
                ))}
            </div>

            {/* Status filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status:</span>
                {([
                    ['All',         'All'],
                    ['Pending',     'Pending / Assigned'],
                    ['PickedUp',    'Picked Up'],
                    ['AtWarehouse', 'At Warehouse'],
                    ['Completed',   'Completed'],
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
                    Loading…
                </div>
            )}
            {error && (
                <div style={{ padding: 16, color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.85rem' }}>
                    {error}
                </div>
            )}
            {!loading && !error && filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
                    No orders match the selected filters.
                </div>
            )}
            {!loading && !error && filtered.length > 0 && (
                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <table className="go-orders-table" style={{ minWidth: 900 }}>
                        <thead>
                            <tr>
                                <th>Tracking №</th>
                                <th>Type</th>
                                <th>Sender</th>
                                <th>Recipient</th>
                                <th>Pickup / City</th>
                                <th>Status</th>
                                <th>Courier</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(o => (
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
        </div>
    );
}
