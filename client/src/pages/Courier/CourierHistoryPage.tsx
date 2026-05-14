import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { fetchMyDeliveryHistory } from '../../api/orders';
import { fetchMyPickupHistory } from '../../api/adminGroupOrders';
import type { CourierOrderHistory } from '../../api/orders';
import type { CourierPickupHistory } from '../../api/adminGroupOrders';
import { STATUS_COLORS } from '../../utils/statusColors';
import { getStatusMeta } from '../../utils/statusMeta';
import '../../styles/dashboard.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function StatusBadge({ status }: { status: string }) {
    const [bg, color] = STATUS_COLORS[status] ?? ['rgba(100,100,100,0.1)', '#666'];
    const { short } = getStatusMeta(status);
    return (
        <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '100px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: bg,
            color,
            whiteSpace: 'nowrap',
        }}>
            {short}
        </span>
    );
}

// ── Delivery History Tab ──────────────────────────────────────────────────────

function DeliveryHistoryTab({ token }: { token: string }) {
    const [items, setItems] = useState<CourierOrderHistory[]>([]);
    const [loading, setLoading] = useState(true);  // starts true — no sync setState needed
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // No synchronous setState here — all updates happen in async callbacks
        fetchMyDeliveryHistory(token)
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError('Failed to load delivery history.'); setLoading(false); });
    }, [token]);

    const retry = () => {
        setLoading(true); setError(null);  // fine outside useEffect
        fetchMyDeliveryHistory(token)
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError('Failed to load delivery history.'); setLoading(false); });
    };

    if (loading) return <div className="dashboard__loader">Loading delivery history…</div>;
    if (error) return <div className="dashboard__error">{error} <button onClick={retry}>Retry</button></div>;
    if (!items.length) return (
        <div className="dashboard__empty" style={{ marginTop: 40 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No deliveries yet</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                Completed deliveries will appear here.
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(order => (
                <div key={order.id} style={{
                    background: 'var(--color-bg-2, #f9fafb)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.1rem' }}>{order.isFragile ? '🥚' : '📦'}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                {order.recipientFirstName}
                            </span>
                        </div>
                        <StatusBadge status={order.status} />
                    </div>

                    {/* Location */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        <span>📍</span>
                        <span>{order.recipientCity}, {order.recipientDistrict}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: 22 }}>
                        {order.recipientAddress}
                    </div>

                    {/* Description */}
                    {order.description && (
                        <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
                            {order.description}
                        </div>
                    )}

                    {/* Footer dates */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            <span style={{ marginRight: 4 }}>🗓</span>
                            <span>Created: {fmt(order.createdAt)}</span>
                        </div>
                        {order.deliveredAt && (
                            <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                                <span style={{ marginRight: 4 }}>✅</span>
                                <span>Delivered: {fmt(order.deliveredAt)}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Pickup History Tab ────────────────────────────────────────────────────────

function PickupHistoryTab({ token }: { token: string }) {
    const [items, setItems] = useState<CourierPickupHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchMyPickupHistory(token)
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError('Failed to load pickup history.'); setLoading(false); });
    }, [token]);

    const retry = () => {
        setLoading(true); setError(null);
        fetchMyPickupHistory(token)
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError('Failed to load pickup history.'); setLoading(false); });
    };

    if (loading) return <div className="dashboard__loader">Loading pickup history…</div>;
    if (error) return <div className="dashboard__error">{error} <button onClick={retry}>Retry</button></div>;
    if (!items.length) return (
        <div className="dashboard__empty" style={{ marginTop: 40 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No pickups yet</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                Completed pickups will appear here.
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(go => (
                <div key={go.id} style={{
                    background: 'var(--color-bg-2, #f9fafb)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                {go.senderBusinessName}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                {go.senderFirstName} {go.senderLastName}
                            </div>
                        </div>
                        <StatusBadge status={go.status} />
                    </div>

                    {/* Location */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        <span>📍</span>
                        <span>{go.pickUpCity}, {go.pickUpDistrict}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: 22 }}>
                        {go.pickUpAddress}
                    </div>

                    {/* Packages */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                        <span>📦</span>
                        <span style={{ fontWeight: 600 }}>{go.numberOfPackages}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>package{go.numberOfPackages !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Note */}
                    {go.note && (
                        <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
                            {go.note}
                        </div>
                    )}

                    {/* Footer dates */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            <span style={{ marginRight: 4 }}>🗓</span>
                            Created: {fmt(go.createdAt)}
                        </div>
                        {go.pickedUpAt && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                <span style={{ marginRight: 4 }}>🚚</span>
                                Picked up: {fmt(go.pickedUpAt)}
                            </div>
                        )}
                        {go.deliveredToWarehouseAt && (
                            <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                                <span style={{ marginRight: 4 }}>🏭</span>
                                To warehouse: {fmt(go.deliveredToWarehouseAt)}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Root page ─────────────────────────────────────────────────────────────────

export function CourierHistoryPage() {
    const { token } = useAuth();
    const [tab, setTab] = useState<'deliveries' | 'pickups'>('deliveries');

    if (!token) return null;

    return (
        <div style={{ padding: '24px 20px', maxWidth: 680, margin: '0 auto' }}>
            {/* Page title */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>📋 History</h1>
                <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Your completed deliveries and pickups.
                </p>
            </div>

            {/* Tab bar */}
            <div style={{
                display: 'flex',
                gap: 4,
                background: 'var(--color-bg-2, #f3f4f6)',
                borderRadius: 10,
                padding: 4,
                marginBottom: 20,
            }}>
                {(['deliveries', 'pickups'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            flex: 1,
                            padding: '9px 16px',
                            borderRadius: 7,
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: tab === t ? 700 : 500,
                            fontSize: '0.875rem',
                            background: tab === t ? 'var(--color-bg)' : 'transparent',
                            color: tab === t ? 'var(--color-text)' : 'var(--color-text-muted)',
                            boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                            transition: 'all 0.15s',
                        }}
                    >
                        {t === 'deliveries' ? '🚚 Deliveries' : '📦 Pickups'}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'deliveries' && <DeliveryHistoryTab token={token} />}
            {tab === 'pickups'    && <PickupHistoryTab   token={token} />}
        </div>
    );
}
