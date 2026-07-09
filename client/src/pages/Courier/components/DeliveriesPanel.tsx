import { useCallback, useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import {
    markOrderDelivered, markOrderDeliveredPaidToSender,
    postponeOrder, retryDelivery, cancelDelivery,
    markReturnPickedUp, markReturnDeliveredWarehouse,
} from '../../../api/orders';
import type { CourierOrder } from '../../../api/orders';
import { SwipeButton } from './SwipeButton';
import { AddressMapLink } from './AddressMapLink';
import { RouteToolbar } from './RouteToolbar';
import { CollectConfirmModal } from './CollectConfirmModal';
import { PostponeModal } from './PostponeModal';
import { CancelModal } from './CancelModal';
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
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [collectConfirmOrderId, setCollectConfirmOrderId] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    // Free-text search over the store (sender) business name, recipient name/address,
    // recipient city/district, and order type (raw value + localized label).
    const q = search.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!q) return deliveries;
        const typeWord = (ty: string) => (ty === 'Return' ? t.aopOrderTypeReturn : ty === 'Exchange' ? t.aopOrderTypeExchange : t.aopOrderTypeSend);
        return deliveries.filter(o => {
            const hay: (string | null | undefined)[] = [
                o.senderBusinessName, o.recipientName, o.recipientPhone,
                o.recipientAddress, o.recipientCity, o.recipientDistrict,
                o.orderType, typeWord(o.orderType), o.trackingNumber,
            ];
            return hay.some(v => (v ?? '').toString().toLowerCase().includes(q));
        });
    }, [deliveries, q, t]);

    const addresses = useMemo(
        () => filtered.map(o => ({ address: o.recipientAddress, district: o.recipientDistrict, city: o.recipientCity })),
        [filtered]
    );
    const { sortMode, setSortMode, locState, coords, geocodeCache, geocoding, retryLocation, refreshLocation } = useGeoSort(addresses);

    // After a stop is completed the list re-fetches and re-sorts; grab a fresh
    // fix at that moment so the new order and next route start from where the
    // courier actually is now.
    const handleAct = useCallback(async (id: string, fn: () => Promise<void>, msg: string) => {
        await onAct(id, fn, msg);
        refreshLocation();
    }, [onAct, refreshLocation]);

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

    const sortedDeliveries = [...filtered].sort((a, b) =>
        sortMode === 'nearest'
            ? distanceTo(a) - distanceTo(b)
            : a.recipientDistrict.localeCompare(b.recipientDistrict)
    );

    const needsCollect = (o: CourierOrder) => {
        const codDue = o.productPaymentStatus === 'NotPaid' && o.amountToCollectForPackage != null && o.amountToCollectForPackage > 0;
        const feeDue = o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;
        return codDue || feeDue;
    };

    const collectTotal = (o: CourierOrder) => {
        const cod = o.productPaymentStatus === 'NotPaid' && o.amountToCollectForPackage != null ? o.amountToCollectForPackage : 0;
        const fee = o.whoPaysForCompanyService === 'Recipient' ? o.companyServicePrice : 0;
        return cod + fee;
    };

    return (
        <div className="dashboard__section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 className="dashboard__title" style={{ margin: 0 }}>{t.cdDeliveriesTitle}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {locState === 'locating' && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.cdLocating}</span>}
                    {locState === 'denied'   && (
                        <span style={{ fontSize: '0.75rem', color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.cdLocEnableHint}
                            <button onClick={retryLocation}
                                style={{ fontSize: '0.75rem', background: 'none', border: '1px solid #f97316', borderRadius: '6px', cursor: 'pointer', padding: '2px 8px', color: '#f97316' }}>
                                {t.cdLocRetry}
                            </button>
                        </span>
                    )}
                    {locState === 'ready' && geocoding && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.cdGeocoding}</span>}
                    <button
                        onClick={() => setSortMode(m => m === 'district' ? 'nearest' : 'district')}
                        disabled={!coords}
                        title={!coords ? t.cdLocEnableHint : undefined}
                        style={{ fontSize: '0.75rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: coords ? 'pointer' : 'not-allowed', opacity: coords ? 1 : 0.5, padding: '3px 8px', color: 'var(--color-text-muted)' }}>
                        {sortMode === 'district' ? t.cdSortNearest : t.cdSortDistrict}
                    </button>
                    {coords && sortMode === 'nearest' && (
                        <button onClick={refreshLocation} title={t.cdLocRefresh} aria-label={t.cdLocRefresh}
                            style={{ fontSize: '0.85rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '3px 7px', color: 'var(--color-text-muted)' }}>
                            ↻
                        </button>
                    )}
                    {expandedIds.size > 0 && (
                        <button onClick={() => setExpandedIds(new Set())}
                            style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                            {t.cdCollapseAll}
                        </button>
                    )}
                </div>
            </div>
            {/* Free-text search: store name, recipient/address, city/district, order type. */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t.cdSearchPh}
                    autoComplete="off"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 30px 9px 12px', borderRadius: 10,
                        border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)',
                        fontSize: '0.85rem', outline: 'none' }}
                />
                {search && (
                    <button onClick={() => setSearch('')} aria-label={t.cancel}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none',
                            border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', fontSize: '1.1rem', lineHeight: 1, padding: 0 }}>
                        ×
                    </button>
                )}
            </div>
            {sortedDeliveries.length === 0 && <div className="dashboard__empty">{t.cdSearchNoMatch}</div>}
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
                                        {order.orderType === 'Return' ? '↩' : order.orderType === 'Exchange' ? '🔄' : order.isFragile ? '🥚' : '🚚'}
                                    </div>
                                    <div className="courier-card__collapse-info">
                                        <span className="courier-card__collapse-primary">
                                            {order.senderBusinessName}
                                        </span>
                                        <span className="courier-card__collapse-secondary">
                                            {(order.orderType === 'Return' && order.returnPickupCity
                                                ? [order.returnPickupAddress, order.returnPickupDistrict, order.returnPickupCity]
                                                : [order.recipientAddress, order.recipientDistrict, order.recipientCity]
                                            ).filter(Boolean).join(', ')}
                                        </span>
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
                                            <AddressMapLink
                                                city={order.recipientCity}
                                                district={order.recipientDistrict}
                                                address={order.recipientAddress}
                                                lat={order.latitude}
                                                lon={order.longitude}
                                            />
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
                                                <span className="courier-card__value" style={{ color: '#f97316' }}>{t.cdPostponeReasons[order.postponeReason]}</span>
                                            </div>
                                        )}
                                        {order.description && <div className="courier-card__note">{order.description}</div>}
                                    </div>
                                    <div className="courier-card__footer">
                                        {(order.status === 'CourierAssignedToDeliver'
                                          || order.status === 'CourierDeliveringTheOrderToRecipient') && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <SwipeButton label={t.cdDeliverySwipeDelivered} variant="success" disabled={isBusy}
                                                    onSwipe={() => {
                                                        if (mustCollect) { setCollectConfirmOrderId(order.id); }
                                                        else { handleAct(order.id, () => markOrderDelivered(token, order.id), t.cdDeliveryToastDelivered); }
                                                    }} />
                                                <button disabled={isBusy} onClick={() => setPostponingId(order.id)}
                                                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #f97316', background: 'transparent', color: '#f97316', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                                                    {t.cdDeliveryBtnPostpone}
                                                </button>
                                                <button disabled={isBusy} onClick={() => setCancellingId(order.id)}
                                                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                                                    {t.cdDeliveryBtnCancel}
                                                </button>
                                            </div>
                                        )}
                                        {order.status === 'DeliveryPostponed' && (
                                            <SwipeButton label={t.cdDeliverySwipeRetry} variant="primary" disabled={isBusy}
                                                onSwipe={() => handleAct(order.id, () => retryDelivery(token, order.id), t.cdDeliveryToastRetry)} />
                                        )}
                                        {order.status === 'CourierAssignedToPickUp' && order.orderType === 'Return' && (
                                            <SwipeButton label={t.cdDeliverySwipeReturnPickup} variant="primary" disabled={isBusy}
                                                onSwipe={() => handleAct(order.id, () => markReturnPickedUp(token, order.id), t.cdDeliveryToastReturnPickup)} />
                                        )}
                                        {order.status === 'PickedUpFromRecipient' && order.orderType === 'Return' && (
                                            <SwipeButton label={t.cdDeliverySwipeReturnWarehouse} variant="success" disabled={isBusy}
                                                onSwipe={() => handleAct(order.id, () => markReturnDeliveredWarehouse(token, order.id), t.cdDeliveryToastReturnWarehouse)} />
                                        )}
                                    </div>
                                    {collectConfirmOrderId === order.id && (
                                        <CollectConfirmModal order={order} isBusy={isBusy}
                                            onCancel={() => setCollectConfirmOrderId(null)}
                                            onConfirm={(updatedAmount) => { setCollectConfirmOrderId(null); handleAct(order.id, () => markOrderDelivered(token, order.id, updatedAmount), t.cdDeliveryToastDelivered); }}
                                            onPaidToSender={(feeAlsoToSender) => { setCollectConfirmOrderId(null); handleAct(order.id, () => markOrderDeliveredPaidToSender(token, order.id, feeAlsoToSender), t.cdDeliveryToastDelivered); }} />
                                    )}
                                    {postponingId === order.id && (
                                        <PostponeModal isBusy={isBusy}
                                            onCancel={() => setPostponingId(null)}
                                            onConfirm={(reason) => { setPostponingId(null); handleAct(order.id, () => postponeOrder(token, order.id, reason), t.cdDeliveryToastPostponed); }} />
                                    )}
                                    {cancellingId === order.id && (
                                        <CancelModal isBusy={isBusy}
                                            onCancel={() => setCancellingId(null)}
                                            onConfirm={(reason, comment) => { setCancellingId(null); handleAct(order.id, () => cancelDelivery(token, order.id, reason, comment), t.cdDeliveryToastCancelled); }} />
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
            <RouteToolbar
                stops={sortedDeliveries.filter(o => selectedIds.has(o.id)).map(o => ({ city: o.recipientCity, district: o.recipientDistrict, address: o.recipientAddress, lat: o.latitude, lon: o.longitude }))}
                onClear={() => setSelectedIds(new Set())}
                geocodeCache={geocodeCache}
                coords={coords}
            />
        </div>
    );
}
