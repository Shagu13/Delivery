import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import {
    markOrderDelivering, markOrderDelivered, postponeOrder, retryDelivery,
    POSTPONE_REASON_LABELS,
} from '../../../api/orders';
import type { CourierOrder } from '../../../api/orders';
import { SwipeButton } from './SwipeButton';
import { mapUrl } from './mapUtils';
import { RouteToolbar } from './RouteToolbar';
import { CollectConfirmModal } from './CollectConfirmModal';
import { PostponeModal } from './PostponeModal';
import { useGeoSort, distanceToAddress } from './useGeoSort';

export interface DeliveriesPanelProps {
    deliveries: CourierOrder[];
    loading: boolean;
    error: string | null;
    busyId: string | null;
    token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

export function DeliveriesPanel({ deliveries, loading, error, busyId, token, onAct }: DeliveriesPanelProps) {
    const { t } = useLanguage();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [postponingId, setPostponingId] = useState<string | null>(null);
    const [collectConfirmOrderId, setCollectConfirmOrderId] = useState<string | null>(null);

    const addresses = deliveries.map(o => ({ address: o.recipientAddress, district: o.recipientDistrict, city: o.recipientCity }));
    const { sortMode, setSortMode, locState, coords, geocodeCache, geocoding } = useGeoSort(addresses);

    const toggle = (id: string) =>
        setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
    const toggleSelect = (id: string) =>
        setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

    if (loading) return <div className="dashboard__loader">{t.cdDeliveriesLoading}</div>;
    if (error)   return <div className="dashboard__error">{error}</div>;
    if (!deliveries.length) return <div className="dashboard__empty">{t.cdDeliveriesEmpty}</div>;

    const distanceTo = (o: CourierOrder) => {
        if (!coords) return Infinity;
        return distanceToAddress(coords, o.recipientAddress, o.recipientDistrict, o.recipientCity, geocodeCache);
    };

    const sortedDeliveries = [...deliveries].sort((a, b) =>
        sortMode === 'nearest'
            ? distanceTo(a) - distanceTo(b)
            : a.recipientDistrict.localeCompare(b.recipientDistrict)
    );

    const needsCollect = (o: CourierOrder) =>
        o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;

    const collectTotal = (o: CourierOrder) =>
        o.productPaymentStatus === 'NotPaid' && o.amountToCollectForPackage != null
            ? o.amountToCollectForPackage + o.companyServicePrice
            : o.companyServicePrice;

    return (
        <div className="dashboard__section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 className="dashboard__title" style={{ margin: 0 }}>{t.cdDeliveriesTitle}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {locState === 'locating' && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.cdLocating}</span>}
                    {locState === 'denied'   && <span style={{ fontSize: '0.75rem', color: '#f97316' }}>{t.cdLocDenied}</span>}
                    {locState === 'ready' && geocoding && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.cdGeocoding}</span>}
                    <button
                        onClick={() => setSortMode(m => m === 'district' ? 'nearest' : 'district')}
                        style={{ fontSize: '0.75rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '3px 8px', color: 'var(--color-text-muted)' }}>
                        {sortMode === 'district' ? t.cdSortNearest : t.cdSortDistrict}
                    </button>
                    {expandedIds.size > 0 && (
                        <button onClick={() => setExpandedIds(new Set())}
                            style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                            {t.cdCollapseAll}
                        </button>
                    )}
                </div>
            </div>
            <div className="courier-cards">
                {sortedDeliveries.map(order => {
                    const isBusy = busyId === order.id;
                    const isExpanded = expandedIds.has(order.id);
                    const isSelected = selectedIds.has(order.id);
                    const mustCollect = needsCollect(order);
                    const total = collectTotal(order);
                    return (
                        <div key={order.id} className={`courier-card${isSelected ? ' courier-card--selected' : ''}`} style={{ position: 'relative' }}>
                            {/* Collapsed row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)}
                                    style={{ width: 18, height: 18, marginLeft: 12, cursor: 'pointer', accentColor: 'var(--color-accent)', flexShrink: 0 }} />
                                <button className="courier-card__collapse-row" style={{ flex: 1 }} onClick={() => toggle(order.id)} aria-expanded={isExpanded}>
                                    <div className="courier-card__collapse-icon">
                                        {order.isFragile ? '🥚' : '🚚'}
                                    </div>
                                    <div className="courier-card__collapse-info">
                                        <span className="courier-card__collapse-primary">
                                            {order.recipientCity}, {order.recipientDistrict},
                                        </span>
                                        <span className="courier-card__collapse-secondary">{order.recipientAddress}</span>
                                    </div>
                                    <div className="courier-card__collapse-right">
                                        {mustCollect && <span className="courier-card__collapse-collect">₾{total.toFixed(2)}</span>}
                                        {order.isFragile && <span className="courier-card__collapse-badge courier-card__collapse-badge--warn">{t.cdLabelFragile}</span>}
                                        <span className="courier-card__collapse-chevron" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                                    </div>
                                </button>
                            </div>

                            {isExpanded && (
                                <>
                                    <div className="courier-card__body">
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelSender}</span>
                                            <span className="courier-card__value">{order.senderBusinessName}</span>
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelPhone}</span>
                                            <a href={`tel:${order.recipientPhone}`} className="courier-card__phone-link">
                                                📞 {order.recipientPhone}
                                            </a>
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelLocation}</span>
                                            <span className="courier-card__value">{order.recipientCity}, {order.recipientDistrict},</span>
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelAddress}</span>
                                            <a href={mapUrl(order.recipientCity, order.recipientDistrict, order.recipientAddress)} target="_blank" rel="noopener noreferrer" className="courier-card__map-link">
                                                📍 {order.recipientAddress}
                                            </a>
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelPayment}</span>
                                            <span className="courier-card__value">
                                                {order.productPaymentStatus === 'Paid' ? (
                                                    t.cdDeliveryPayPaid
                                                ) : (() => {
                                                    const parcelDue  = order.productPaymentStatus === 'NotPaid';
                                                    const courierDue = order.whoPaysForCompanyService === 'Recipient' && order.companyServicePrice > 0;
                                                    const sub = parcelDue && courierDue ? t.aopSubParcelAndFee
                                                              : courierDue              ? t.aopSubFeeOnly
                                                                                        : t.aopSubParcelOnly;
                                                    return (
                                                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                                            <span>{t.aopUnpaid}</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{sub}</span>
                                                        </span>
                                                    );
                                                })()}
                                            </span>
                                        </div>
                                        {mustCollect && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelCollect}</span>
                                                <span className="courier-card__value" style={{ color: '#dc2626', fontWeight: 700 }}>₾{total.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {order.deliveryDateFrom && order.deliveryDateTo && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelWindow}</span>
                                                <span className="courier-card__value">
                                                    {new Date(order.deliveryDateFrom).toLocaleDateString()} – {new Date(order.deliveryDateTo).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                        {order.status === 'DeliveryPostponed' && order.postponeReason && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelPostponed}</span>
                                                <span className="courier-card__value" style={{ color: '#f97316' }}>{POSTPONE_REASON_LABELS[order.postponeReason]}</span>
                                            </div>
                                        )}
                                        {order.description && <div className="courier-card__note">{order.description}</div>}
                                    </div>
                                    <div className="courier-card__footer">
                                        {order.status === 'CourierAssignedToDeliver' && (
                                            <SwipeButton label={t.cdDeliverySwipeOnWay} variant="primary" disabled={isBusy}
                                                onSwipe={() => onAct(order.id, () => markOrderDelivering(token, order.id), t.cdDeliveryToastOnWay)} />
                                        )}
                                        {order.status === 'CourierDeliveringTheOrderToRecipient' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <SwipeButton label={t.cdDeliverySwipeDelivered} variant="success" disabled={isBusy}
                                                    onSwipe={() => {
                                                        if (mustCollect) { setCollectConfirmOrderId(order.id); }
                                                        else { onAct(order.id, () => markOrderDelivered(token, order.id), t.cdDeliveryToastDelivered); }
                                                    }} />
                                                <button disabled={isBusy} onClick={() => setPostponingId(order.id)}
                                                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #f97316', background: 'transparent', color: '#f97316', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                                                    {t.cdDeliveryBtnPostpone}
                                                </button>
                                            </div>
                                        )}
                                        {order.status === 'DeliveryPostponed' && (
                                            <SwipeButton label={t.cdDeliverySwipeRetry} variant="primary" disabled={isBusy}
                                                onSwipe={() => onAct(order.id, () => retryDelivery(token, order.id), t.cdDeliveryToastRetry)} />
                                        )}
                                    </div>
                                    {collectConfirmOrderId === order.id && (
                                        <CollectConfirmModal order={order} isBusy={isBusy}
                                            onCancel={() => setCollectConfirmOrderId(null)}
                                            onConfirm={() => { setCollectConfirmOrderId(null); onAct(order.id, () => markOrderDelivered(token, order.id), t.cdDeliveryToastDelivered); }} />
                                    )}
                                    {postponingId === order.id && (
                                        <PostponeModal isBusy={isBusy}
                                            onCancel={() => setPostponingId(null)}
                                            onConfirm={(reason) => { setPostponingId(null); onAct(order.id, () => postponeOrder(token, order.id, reason), t.cdDeliveryToastPostponed); }} />
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
            <RouteToolbar
                stops={sortedDeliveries.filter(o => selectedIds.has(o.id)).map(o => ({ city: o.recipientCity, district: o.recipientDistrict, address: o.recipientAddress }))}
                onClear={() => setSelectedIds(new Set())}
            />
        </div>
    );
}
