import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchMyDeliveryHistory } from '../../api/orders';
import { fetchMyPickupHistory } from '../../api/adminGroupOrders';
import type { CourierOrderHistory } from '../../api/orders';
import type { CourierPickupHistory } from '../../api/adminGroupOrders';
import { STATUS_COLORS } from '../../utils/statusColors';
import { getStatusMeta } from '../../utils/statusMeta';
import '../../styles/dashboard.css';

function fmt(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
    const [bg, color] = STATUS_COLORS[status] ?? ['rgba(100,100,100,0.1)', '#666'];
    const { short } = getStatusMeta(status);
    return (
        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
            {short}
        </span>
    );
}

// ── Delivery History Tab ──────────────────────────────────────────────────────
function DeliveryHistoryTab({ token }: { token: string }) {
    const { t } = useLanguage();
    const [items, setItems] = useState<CourierOrderHistory[]>([]);
    const [loading, setLoading] = useState(true);   // starts true — no need to setLoading(true) in effect
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        // No synchronous setState here — only inside promise callbacks
        fetchMyDeliveryHistory(token)
            .then(data  => { if (!cancelled) setItems(data); })
            .catch(()   => { if (!cancelled) setError(t.cdHistDeliveryFailed); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [token]);

    // Retry: setState here is outside any effect — fine
    const retry = () => {
        setLoading(true);
        setError(null);
        fetchMyDeliveryHistory(token)
            .then(data  => setItems(data))
            .catch(()   => setError(t.cdHistDeliveryFailed))
            .finally(() => setLoading(false));
    };

    if (loading) return <div className="dashboard__loader">{t.cdHistDeliveryLoading}</div>;
    if (error)   return <div className="dashboard__error">{error} <button onClick={retry}>{t.cdRetry}</button></div>;
    if (!items.length) return (
        <div className="dashboard__empty" style={{ marginTop: 40 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.cdHistDeliveryEmpty}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.cdHistDeliveryEmptyHint}</div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(order => (
                <div key={order.id} style={{ background: 'var(--color-bg-2, #f9fafb)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.1rem' }}>{order.isFragile ? '🥚' : '📦'}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{order.recipientFirstName}</span>
                        </div>
                        <StatusBadge status={order.status} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        <span>📍</span><span>{order.recipientCity}, {order.recipientDistrict}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: 22 }}>{order.recipientAddress}</div>
                    {order.description && (
                        <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>{order.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>🗓 {t.cdHistCreated} {fmt(order.createdAt)}</div>
                        {order.deliveredAt && (
                            <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>✅ {t.cdHistDelivered} {fmt(order.deliveredAt)}</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Pickup History Tab ────────────────────────────────────────────────────────
function PickupHistoryTab({ token }: { token: string }) {
    const { t } = useLanguage();
    const [items, setItems] = useState<CourierPickupHistory[]>([]);
    const [loading, setLoading] = useState(true);   // starts true — no need to setLoading(true) in effect
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        // No synchronous setState here — only inside promise callbacks
        fetchMyPickupHistory(token)
            .then(data  => { if (!cancelled) setItems(data); })
            .catch(()   => { if (!cancelled) setError(t.cdHistPickupFailed); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [token]);

    // Retry: setState here is outside any effect — fine
    const retry = () => {
        setLoading(true);
        setError(null);
        fetchMyPickupHistory(token)
            .then(data  => setItems(data))
            .catch(()   => setError(t.cdHistPickupFailed))
            .finally(() => setLoading(false));
    };

    if (loading) return <div className="dashboard__loader">{t.cdHistPickupLoading}</div>;
    if (error)   return <div className="dashboard__error">{error} <button onClick={retry}>{t.cdRetry}</button></div>;
    if (!items.length) return (
        <div className="dashboard__empty" style={{ marginTop: 40 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.cdHistPickupEmpty}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.cdHistPickupEmptyHint}</div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(go => (
                <div key={go.id} style={{ background: 'var(--color-bg-2, #f9fafb)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{go.senderBusinessName}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{go.senderFirstName} {go.senderLastName}</div>
                        </div>
                        <StatusBadge status={go.status} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        <span>📍</span><span>{go.pickUpCity}, {go.pickUpDistrict}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', paddingLeft: 22 }}>{go.pickUpAddress}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                        <span>📦</span>
                        <span style={{ fontWeight: 600 }}>{t.cdLabelPackageCount(go.numberOfPackages)}</span>
                    </div>
                    {go.note && (
                        <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>{go.note}</div>
                    )}
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>🗓 {t.cdHistCreated} {fmt(go.createdAt)}</div>
                        {go.pickedUpAt && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>🚚 {t.cdHistPickedUp} {fmt(go.pickedUpAt)}</div>
                        )}
                        {go.deliveredToWarehouseAt && (
                            <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>🏭 {t.cdHistToWarehouse} {fmt(go.deliveredToWarehouseAt)}</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function CourierHistoryPage() {
    const { token } = useAuth();
    const { t } = useLanguage();
    const [tab, setTab] = useState<'deliveries' | 'pickups'>('deliveries');

    if (!token) return null;

    return (
        <div style={{ padding: '24px 20px', maxWidth: 680, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{t.cdHistTitle}</h1>
                <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.cdHistSubtitle}</p>
            </div>

            <div style={{ display: 'flex', gap: 4, background: 'var(--color-bg-2, #f3f4f6)', borderRadius: 10, padding: 4, marginBottom: 20 }}>
                {(['deliveries', 'pickups'] as const).map(key => (
                    <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '9px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: tab === key ? 700 : 500, fontSize: '0.875rem', background: tab === key ? 'var(--color-bg)' : 'transparent', color: tab === key ? 'var(--color-text)' : 'var(--color-text-muted)', boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.15s' }}>
                        {key === 'deliveries' ? t.cdHistTabDeliveries : t.cdHistTabPickups}
                    </button>
                ))}
            </div>

            {tab === 'deliveries' && <DeliveryHistoryTab token={token} />}
            {tab === 'pickups'    && <PickupHistoryTab   token={token} />}
        </div>
    );
}
