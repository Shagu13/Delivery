import { useLanguage } from '../../../contexts/useLanguage';
import './NewOrderAlert.css';

/** A newly-assigned order to surface in the heads-up popup. */
export interface NewOrderAlertItem {
    id: string;
    kind: 'pickup' | 'delivery';
    store: string;
    address: string;
    city: string;
    district: string;
    /** Raw order type: Send | Return | Exchange. */
    type: string;
    /** Straight-line distance from the courier's current position, when known. */
    distanceKm: number | null;
}

export function NewOrderAlert({ items, onView, onDismiss }: {
    items: NewOrderAlertItem[];
    onView: (kind: 'pickup' | 'delivery') => void;
    onDismiss: () => void;
}) {
    const { t } = useLanguage();
    if (items.length === 0) return null;

    const typeLabel = (ty: string) =>
        ty === 'Return' ? t.aopOrderTypeReturn : ty === 'Exchange' ? t.aopOrderTypeExchange : t.aopOrderTypeSend;
    const kindLabel = (k: 'pickup' | 'delivery') => (k === 'pickup' ? t.cdNewOrderPickup : t.cdNewOrderDelivery);
    const fmtDist = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

    return (
        <div className="noa-overlay" role="alert" aria-live="assertive" onClick={onDismiss}>
            <div className="noa-card" onClick={e => e.stopPropagation()}>
                <div className="noa-head">
                    <span className="noa-bell" aria-hidden>🔔</span>
                    <span className="noa-title">
                        {items.length > 1 ? t.cdNewOrdersTitle(items.length) : t.cdNewOrderTitle}
                    </span>
                    <button className="noa-close" onClick={onDismiss} aria-label={t.cancel}>×</button>
                </div>
                <div className="noa-list">
                    {items.slice(0, 4).map(o => (
                        <div key={o.id} className="noa-item">
                            <div className="noa-item-top">
                                <span className={`noa-kind noa-kind--${o.kind}`}>{kindLabel(o.kind)}</span>
                                <span className="noa-type">{typeLabel(o.type)}</span>
                                {o.distanceKm != null && (
                                    <span className="noa-dist">📍 {fmtDist(o.distanceKm)} {t.cdKmAway}</span>
                                )}
                            </div>
                            {o.store && <div className="noa-store">🏪 {o.store}</div>}
                            <div className="noa-addr">{[o.city, o.district, o.address].filter(Boolean).join(', ')}</div>
                        </div>
                    ))}
                    {items.length > 4 && <div className="noa-more">+{items.length - 4}</div>}
                </div>
                <div className="noa-actions">
                    <button className="noa-btn noa-btn--ghost" onClick={onDismiss}>{t.cdNewOrderDismiss}</button>
                    <button className="noa-btn noa-btn--primary" onClick={() => onView(items[0].kind)}>{t.cdNewOrderView}</button>
                </div>
            </div>
        </div>
    );
}
