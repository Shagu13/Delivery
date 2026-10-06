import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { PhoneActions } from '../../components/ui/PhoneActions';
import { fetchMyDeliveryHistory } from '../../api/orders';
import { fetchMyPickupHistory } from '../../api/adminGroupOrders';
import type { CourierOrderHistory } from '../../api/orders';
import type { CourierPickupHistory } from '../../api/adminGroupOrders';
import { STATUS_COLORS } from '../../utils/statusColors';
import { getStatusMeta } from '../../utils/statusMeta';
import { georgianDateKeyOf } from '../../utils/georgianTime';
import '../../styles/dashboard.css';

function fmt(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ReturnedToSender is green in the shared map because for a standalone Return order it is the
// intended happy ending. On this tab it only ever means a failed Send/Exchange delivery, so amber
// keeps it from reading as a success next to the green delivered badges.
const HISTORY_STATUS_COLORS: Record<string, [string, string]> = {
    ReturnedToSender: ['rgba(217,119,6,0.12)', '#d97706'],
};

function StatusBadge({ status }: { status: string }) {
    const [bg, color] = HISTORY_STATUS_COLORS[status] ?? STATUS_COLORS[status] ?? ['rgba(100,100,100,0.1)', '#666'];
    const { short } = getStatusMeta(status);
    return <span className="hist-badge" style={{ background: bg, color }}>{short}</span>;
}

interface HistoryCardProps {
    title: ReactNode;
    subtitle?: ReactNode;
    status: string;
    location: string;
    address: string;
    note?: string | null;
    extraLine?: ReactNode;
    dates: ReactNode;
}

function HistoryCard({ title, subtitle, status, location, address, note, extraLine, dates }: HistoryCardProps) {
    return (
        <div className="hist-card">
            <div className="hist-card__top">
                <div>
                    <div className="hist-card__title">{title}</div>
                    {subtitle && <div className="hist-card__subtitle">{subtitle}</div>}
                </div>
                <StatusBadge status={status} />
            </div>
            <div className="hist-card__line"><span>📍</span><span>{location}</span></div>
            <div className="hist-card__indent">{address}</div>
            {extraLine}
            {note && <div className="hist-card__indent hist-card__note">{note}</div>}
            <div className="hist-card__dates">{dates}</div>
        </div>
    );
}

function HistoryState({ error, empty, emptyHint, onRetry, hasItems, children }: {
    error: string | null; empty: string; emptyHint: string;
    onRetry: () => void; hasItems: boolean; children: ReactNode;
}) {
    const { t } = useLanguage();
    if (error)   return <div className="dashboard__error">{error} <button onClick={onRetry}>{t.cdRetry}</button></div>;
    if (!hasItems) return (
        <div className="dashboard__empty" style={{ marginTop: 40 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{empty}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{emptyHint}</div>
        </div>
    );
    return <div className="hist-list">{children}</div>;
}

// Only these two statuses mean the parcel actually reached the recipient. Everything else in
// history ended without a delivery, so it must never render as "Delivered" — ReturnedToSender
// stamps DeliveredAt (it dates the billing event) despite the parcel going back to the sender.
const DELIVERED_STATUSES = ['DeliveredToRecipient', 'ExchangeCompleted'];

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

    // Items arrive newest-first, so a day header goes before the first card of each Georgian day.
    // The subtotal is the cash collected at the door for that day (server-computed per order).
    const closedAtOf = (o: CourierOrderHistory) =>
        (DELIVERED_STATUSES.includes(o.status) ? o.deliveredAt : (o.cancelledAt ?? o.deliveredAt)) ?? o.createdAt;
    const dayTotals = new Map<string, number>();
    for (const o of items) {
        const key = georgianDateKeyOf(closedAtOf(o));
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + o.collectedAmount);
    }

    return (
        <HistoryState error={error} empty={t.cdHistDeliveryEmpty} emptyHint={t.cdHistDeliveryEmptyHint}
            onRetry={retry} hasItems={items.length > 0}>
            {items.map((order, i) => {
                const delivered = DELIVERED_STATUSES.includes(order.status);
                const closedAt  = delivered ? order.deliveredAt : (order.cancelledAt ?? order.deliveredAt);
                const dayKey    = georgianDateKeyOf(closedAtOf(order));
                const dayTotal  = dayTotals.get(dayKey) ?? 0;
                const showDay   = i === 0 || georgianDateKeyOf(closedAtOf(items[i - 1])) !== dayKey;
                return (
                <Fragment key={order.id}>
                {showDay && (
                    <div className="hist-day">
                        <span>{fmt(closedAtOf(order))}</span>
                        {dayTotal > 0 && (
                            <span className="hist-day__sum">{t.cdHistDayCollected}: ₾{dayTotal.toFixed(2)}</span>
                        )}
                    </div>
                )}
                <HistoryCard
                    title={<>{order.isFragile ? '🥚' : '📦'} {recipientDisplayName(order.recipientName, t.recipientUnknown)}</>}
                    status={order.status}
                    location={`${order.recipientCity}, ${order.recipientDistrict}`}
                    address={order.recipientAddress}
                    note={order.description}
                    extraLine={<>
                        {(order.shopName || order.shopPhone) && (
                            <div className="hist-card__line">
                                <span>🏬</span>
                                <span>
                                    {order.shopName}
                                    {order.shopName && order.shopPhone && ' · '}
                                    {order.shopPhone && <PhoneActions phone={order.shopPhone} />}
                                </span>
                            </div>
                        )}
                        {order.collectedAmount > 0 && (
                            <div className="hist-card__line">
                                <span>💰</span>
                                <span className="hist-card__collected">{t.cdHistCollected}: ₾{order.collectedAmount.toFixed(2)}</span>
                            </div>
                        )}
                    </>}
                    dates={<>
                        <div className="hist-card__date">🗓 {t.cdHistCreated} {fmt(order.createdAt)}</div>
                        {closedAt && (
                            delivered
                                ? <div className="hist-card__date hist-card__date--done">✅ {t.cdHistDelivered} {fmt(closedAt)}</div>
                                : <div className="hist-card__date">🚫 {t.cdHistCancelled} {fmt(closedAt)}</div>
                        )}
                    </>}
                />
                </Fragment>
                );
            })}
        </HistoryState>
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

    return (
        <HistoryState error={error} empty={t.cdHistPickupEmpty} emptyHint={t.cdHistPickupEmptyHint}
            onRetry={retry} hasItems={items.length > 0}>
            {items.map(go => (
                <HistoryCard key={go.id}
                    title={go.senderBusinessName}
                    subtitle={`${go.senderFirstName} ${go.senderLastName}`}
                    status={go.status}
                    location={`${go.pickUpCity}, ${go.pickUpDistrict}`}
                    address={go.pickUpAddress}
                    note={go.note}
                    extraLine={
                        <>
                            {go.senderPhone && (
                                <div className="hist-card__line">
                                    <span>📞</span>
                                    <PhoneActions phone={go.senderPhone} />
                                </div>
                            )}
                            <div className="hist-card__line">
                                <span>📦</span>
                                <span style={{ fontWeight: 600 }}>{t.cdLabelPackageCount(go.numberOfPackages)}</span>
                            </div>
                        </>
                    }
                    dates={<>
                        <div className="hist-card__date">🗓 {t.cdHistCreated} {fmt(go.createdAt)}</div>
                        {go.pickedUpAt && (
                            <div className="hist-card__date">🚚 {t.cdHistPickedUp} {fmt(go.pickedUpAt)}</div>
                        )}
                        {go.deliveredToWarehouseAt && (
                            <div className="hist-card__date hist-card__date--done">🏭 {t.cdHistToWarehouse} {fmt(go.deliveredToWarehouseAt)}</div>
                        )}
                    </>}
                />
            ))}
        </HistoryState>
    );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function CourierHistoryPage() {
    const { token } = useAuth();
    const { t } = useLanguage();
    const [tab, setTab] = useState<'deliveries' | 'pickups'>('deliveries');

    if (!token) return null;

    return (
        <div className="hist-page">
            <div className="hist-page__header">
                <h1 className="hist-page__title">{t.cdHistTitle}</h1>
                <p className="hist-page__subtitle">{t.cdHistSubtitle}</p>
            </div>

            <div className="hist-tabs">
                {(['deliveries', 'pickups'] as const).map(key => (
                    <button key={key} onClick={() => setTab(key)} className={`hist-tab${tab === key ? ' hist-tab--active' : ''}`}>
                        {key === 'deliveries' ? t.cdHistTabDeliveries : t.cdHistTabPickups}
                    </button>
                ))}
            </div>

            {tab === 'deliveries' && <DeliveryHistoryTab token={token} />}
            {tab === 'pickups'    && <PickupHistoryTab   token={token} />}
        </div>
    );
}
