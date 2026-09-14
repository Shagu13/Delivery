import { Fragment, useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import {
    markPickedUp, markDeliveredToWarehouse,
} from '../../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../../api/adminGroupOrders';
import { markReturnPickedUp, markReturnDeliveredWarehouse } from '../../../api/orders';
import type { CourierOrder } from '../../../api/orders';
import { SwipeButton } from './SwipeButton';
import { AddressMapLink } from './AddressMapLink';
import { useGeoSort, distanceToAddress } from './useGeoSort';
import { RouteToolbar } from './RouteToolbar';
import { fmtAssignedAt } from './courierTime';

export interface PickupsPanelProps {
    pickups: AdminGroupOrder[];
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    busyId: string | null;
    token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
    onBulkAct: (ids: string[], fn: (id: string) => Promise<void>, msg: string) => Promise<void>;
    /** Standalone Return orders assigned to this courier in pickup-phase statuses — the
     *  courier collects the parcel from the recipient's location, not a sender batch. */
    returnPickups: CourierOrder[];
}

export function PickupsPanel({ pickups, loading, error, onRefresh, busyId, token, onAct, onBulkAct, returnPickups }: PickupsPanelProps) {
    const { t, lang } = useLanguage();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [search, setSearch] = useState('');

    // The three pickup stages, each with its API call + button label + success toast.
    // A bulk action is offered only when every selected pickup shares one status.
    const bulkActionFor = (status: string) => {
        switch (status) {
            // The "on my way" pickup step was removed — Picked-up is the first action now.
            case 'CourierAssignedToPickUp':
                return { fn: (id: string) => markPickedUp(token, id),            label: t.cdPickupSwipePickedUp,   toast: t.cdPickupToastPickedUp,   variant: 'primary' as const };
            case 'CourierDeliveringToWarehouse':
                return { fn: (id: string) => markDeliveredToWarehouse(token, id), label: t.cdPickupSwipeToWarehouse, toast: t.cdPickupToastToWarehouse, variant: 'success' as const };
            default:
                return null;
        }
    };

    // Free-text search over the sender's business name, the pickup address/city/district,
    // and the order type (matches both the raw value and the localized label).
    const q = search.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!q) return pickups;
        const typeWord = (ty: string) => (ty === 'Return' ? t.aopOrderTypeReturn : ty === 'Exchange' ? t.aopOrderTypeExchange : t.aopOrderTypeSend);
        return pickups.filter(go => {
            const hay: (string | null | undefined)[] = [
                go.senderBusinessName, go.senderFirstName, go.senderLastName, go.senderPhone,
                go.pickUpAddress, go.pickUpCity, go.pickUpCityGeo, go.pickUpDistrict, go.pickUpDistrictGeo,
                ...go.orders.flatMap(o => [o.orderType, typeWord(o.orderType), o.trackingNumber, o.recipientName]),
            ];
            return hay.some(v => (v ?? '').toString().toLowerCase().includes(q));
        });
    }, [pickups, q, t]);

    const addresses = useMemo(
        () => filtered.map(go => ({ address: go.pickUpAddress, district: go.pickUpDistrict, city: go.pickUpCity })),
        [filtered]
    );
    const { sortMode, setSortMode, locState, coords, geocodeCache, geocoding, retryLocation, refreshLocation } = useGeoSort(addresses);

    // Same free-text search, scoped to the standalone Return-pickup cards (recipient is the
    // pickup contact for these — there's no sender batch involved).
    const returnFiltered = useMemo(() => {
        if (!q) return returnPickups;
        return returnPickups.filter(o => {
            const hay: (string | null | undefined)[] = [
                o.recipientName, o.recipientPhone, o.trackingNumber,
                o.returnPickupAddress, o.returnPickupCity, o.returnPickupDistrict,
            ];
            return hay.some(v => (v ?? '').toString().toLowerCase().includes(q));
        });
    }, [returnPickups, q]);

    // Mirrors DeliveriesPanel's collect-on-delivery logic — informational only here (the
    // pickup swipe never triggers a collect-confirm step, that only happens at last-mile).
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

    const toggle = (id: string) =>
        setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
    const toggleSelect = (id: string) =>
        setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

    if (loading) return <div className="dashboard__loader">{t.cdPickupsLoading}</div>;
    if (error)   return <div className="dashboard__error">{error} <button onClick={onRefresh}>{t.cdRetry}</button></div>;
    if (!pickups.length && !returnPickups.length) return <div className="dashboard__empty">{t.cdPickupsEmpty}</div>;

    const distanceTo = (go: AdminGroupOrder) => {
        if (!coords) return Infinity;
        return distanceToAddress(coords, go.pickUpAddress, go.pickUpDistrict, go.pickUpCity, geocodeCache);
    };

    // Picked-up batches (awaiting the warehouse drop-off) sink to the bottom so the next
    // batch to head to rises to the top; within each group keep the chosen sort.
    const stageRank = (go: AdminGroupOrder) => (go.status === 'CourierDeliveringToWarehouse' ? 1 : 0);
    const sortedPickups = [...filtered].sort((a, b) => {
        const s = stageRank(a) - stageRank(b);
        if (s !== 0) return s;
        return sortMode === 'nearest'
            ? distanceTo(a) - distanceTo(b)
            : a.pickUpDistrict.localeCompare(b.pickUpDistrict);
    });

    // Batches already picked up, waiting to be dropped at the warehouse at day's end.
    const pickedUpIds = sortedPickups.filter(go => go.status === 'CourierDeliveringToWarehouse').map(go => go.id);

    // Bulk action: enabled only when all selected pickups share a single status,
    // so the one action that's valid for that stage can apply to every selection.
    const selectedPickups = sortedPickups.filter(go => selectedIds.has(go.id));
    const sharedStatus = selectedPickups.length > 0 && selectedPickups.every(go => go.status === selectedPickups[0].status)
        ? selectedPickups[0].status : null;
    const bulkAction = sharedStatus ? bulkActionFor(sharedStatus) : null;

    const runBulk = async () => {
        if (!bulkAction) return;
        setBulkBusy(true);
        await onBulkAct(selectedPickups.map(go => go.id), bulkAction.fn, bulkAction.toast);
        setBulkBusy(false);
        setSelectedIds(new Set());
    };

    // Identify a customer by business name + phone (no customerId on the DTO), so a
    // single tap can select every pickup belonging to the same customer.
    const customerKey = (go: AdminGroupOrder) => `${go.senderBusinessName}|${go.senderPhone}`;
    const customerCounts: Record<string, number> = {};
    for (const p of filtered) { const k = customerKey(p); customerCounts[k] = (customerCounts[k] ?? 0) + 1; }
    const selectCustomer = (go: AdminGroupOrder) => {
        const key = customerKey(go);
        setSelectedIds(prev => {
            const n = new Set(prev);
            filtered.forEach(p => { if (customerKey(p) === key) n.add(p.id); });
            return n;
        });
    };

    return (
        <div className="dashboard__section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 className="dashboard__title" style={{ margin: 0 }}>{t.cdPickupsTitle}</h2>
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
            {/* Free-text search: store name, pickup address, city/district, order type. */}
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
            {pickedUpIds.length > 0 && (
                <button
                    onClick={() => setSelectedIds(new Set(pickedUpIds))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        width: '100%', marginBottom: 10, padding: '11px 14px',
                        background: 'var(--color-accent)', color: '#fff', border: 'none',
                        borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                    🏁 {t.cdFinishDay} ({pickedUpIds.length})
                </button>
            )}
            {selectedIds.size > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10,
                    background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
                    borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>
                            {t.cdBulkSelected(selectedIds.size)}
                        </span>
                        <button onClick={() => setSelectedIds(new Set())}
                            style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'none',
                                border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', padding: '6px 12px', marginLeft: 'auto' }}>
                            {t.cdBulkClear}
                        </button>
                    </div>
                    {bulkAction ? (
                        <SwipeButton label={bulkBusy ? t.cdBulkApplying : bulkAction.label} variant={bulkAction.variant}
                            disabled={bulkBusy} onSwipe={runBulk} />
                    ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.cdBulkMixed}</span>
                    )}
                </div>
            )}
            {sortedPickups.length === 0 && <div className="dashboard__empty">{t.cdSearchNoMatch}</div>}
            <div className="courier-cards">
                {sortedPickups.map((go, i) => {
                    const isExpanded = expandedIds.has(go.id);
                    const isSelected = selectedIds.has(go.id);
                    // Label the boundary where picked-up (awaiting-warehouse) batches begin.
                    const showPickedUpDivider = go.status === 'CourierDeliveringToWarehouse'
                        && (i === 0 || sortedPickups[i - 1].status !== 'CourierDeliveringToWarehouse');
                    return (
                        <Fragment key={go.id}>
                        {showPickedUpDivider && (
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '8px 4px 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                ✅ {t.cdPickedUpSection(pickedUpIds.length)}
                            </div>
                        )}
                        <div className={`courier-card${isSelected ? ' courier-card--selected' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(go.id)}
                                    style={{ width: 18, height: 18, marginLeft: 12, cursor: 'pointer', accentColor: 'var(--color-accent)', flexShrink: 0 }} />
                                <button className="courier-card__collapse-row" style={{ flex: 1 }} onClick={() => toggle(go.id)} aria-expanded={isExpanded}>
                                    <div className="courier-card__collapse-icon">📦</div>
                                    <div className="courier-card__collapse-info">
                                        <span className="courier-card__collapse-primary">
                                            {go.senderBusinessName}
                                        </span>
                                        <span className="courier-card__collapse-secondary">
                                            {[go.pickUpAddress, go.pickUpDistrict, go.pickUpCity].filter(Boolean).join(', ')}
                                        </span>
                                    </div>
                                    <div className="courier-card__collapse-right">
                                        <span className="courier-card__collapse-chevron" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                                    </div>
                                </button>
                                {customerCounts[customerKey(go)] > 1 && (
                                    <button onClick={() => selectCustomer(go)}
                                        title={t.cdSelectCustomerTitle(customerCounts[customerKey(go)])}
                                        style={{ flexShrink: 0, marginRight: 10, fontSize: '0.72rem', fontWeight: 700,
                                            background: 'var(--color-accent-dim)', color: 'var(--color-accent)',
                                            border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer',
                                            padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                        👥 {customerCounts[customerKey(go)]}
                                    </button>
                                )}
                            </div>
                            {isExpanded && (
                                <>
                                    <div className="courier-card__body">
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">🏪 {t.cdLabelSender}</span>
                                            <span className="courier-card__value">{go.senderBusinessName || `${go.senderFirstName} ${go.senderLastName}`}</span>
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelLocation}</span>
                                            <span className="courier-card__value">{go.pickUpCity}, {go.pickUpDistrict}</span>
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelAddress}</span>
                                            <AddressMapLink
                                                city={go.pickUpCity}
                                                district={go.pickUpDistrict}
                                                address={go.pickUpAddress}
                                                lat={go.pickUpLatitude}
                                                lon={go.pickUpLongitude}
                                            />
                                        </div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelPackages}</span>
                                            <span className="courier-card__value">{t.cdLabelPackageCount(go.numberOfPackages)}</span>
                                        </div>
                                        {go.senderPhone && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelPhone}</span>
                                                <a href={`tel:${go.senderPhone}`} className="courier-card__phone-link">
                                                    📞 {go.senderPhone}
                                                </a>
                                            </div>
                                        )}
                                        {go.alternativeSenderPhone && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelAltPhone}</span>
                                                <a href={`tel:${go.alternativeSenderPhone}`} className="courier-card__phone-link">
                                                    📞 {go.alternativeSenderPhone}
                                                </a>
                                            </div>
                                        )}
                                        {go.whenPackagePickedUpDate && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelScheduled}</span>
                                                <span className="courier-card__value">{new Date(go.whenPackagePickedUpDate).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                        {go.note && <div className="courier-card__note">{go.note}</div>}
                                    </div>
                                    <div className="courier-card__footer">
                                        {go.status === 'CourierAssignedToPickUp' && (
                                            <SwipeButton label={t.cdPickupSwipePickedUp} variant="primary" disabled={busyId === go.id}
                                                onSwipe={() => onAct(go.id, () => markPickedUp(token, go.id), t.cdPickupToastPickedUp)} />
                                        )}
                                        {go.status === 'CourierDeliveringToWarehouse' && (
                                            <SwipeButton label={t.cdPickupSwipeToWarehouse} variant="success" disabled={busyId === go.id}
                                                onSwipe={() => onAct(go.id, () => markDeliveredToWarehouse(token, go.id), t.cdPickupToastToWarehouse)} />
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        </Fragment>
                    );
                })}
            </div>

            {/* Standalone Return orders: the courier collects the parcel from the recipient's
                location rather than a sender's — same kind of job, kept as its own section since
                the card shape (single order, no package count/batch fields) differs from a batch pickup. */}
            {returnFiltered.length > 0 && (
                <>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '14px 4px 6px' }}>
                        {t.cdReturnPickupsTitle(returnFiltered.length)}
                    </div>
                    <div className="courier-cards">
                        {returnFiltered.map(order => {
                            const isExpanded = expandedIds.has(order.id);
                            const isBusy = busyId === order.id;
                            const mustCollect = needsCollect(order);
                            const total = collectTotal(order);
                            return (
                                <div key={order.id} className="courier-card">
                                    <button className="courier-card__collapse-row" onClick={() => toggle(order.id)} aria-expanded={isExpanded}>
                                        <div className="courier-card__collapse-icon">↩</div>
                                        <div className="courier-card__collapse-info">
                                            <span className="courier-card__collapse-primary">{order.recipientName}</span>
                                            {order.senderBusinessName && (
                                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                                                    🏪 {order.senderBusinessName}
                                                </span>
                                            )}
                                            <span className="courier-card__collapse-secondary">
                                                {[order.returnPickupAddress, order.returnPickupDistrict, order.returnPickupCity].filter(Boolean).join(', ')}
                                            </span>
                                        </div>
                                        <div className="courier-card__collapse-right">
                                            {mustCollect && <span className="courier-card__collapse-collect">₾{total.toFixed(2)}</span>}
                                            <span className="courier-card__collapse-chevron" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <>
                                            <div className="courier-card__body">
                                                <div className="courier-card__row">
                                                    <span className="courier-card__label">{t.cdLabelPhone}</span>
                                                    <a href={`tel:${order.recipientPhone}`} className="courier-card__phone-link">
                                                        📞 {order.recipientPhone}
                                                    </a>
                                                </div>
                                                <div className="courier-card__row">
                                                    <span className="courier-card__label">{t.cdLabelLocation}</span>
                                                    <span className="courier-card__value">{order.returnPickupCity}, {order.returnPickupDistrict},</span>
                                                </div>
                                                <div className="courier-card__row">
                                                    <span className="courier-card__label">{t.cdLabelAddress}</span>
                                                    <AddressMapLink
                                                        city={order.returnPickupCity ?? ''}
                                                        district={order.returnPickupDistrict ?? ''}
                                                        address={order.returnPickupAddress ?? ''}
                                                        lat={order.latitude}
                                                        lon={order.longitude}
                                                    />
                                                </div>
                                                {mustCollect && (
                                                    <div className="courier-card__row">
                                                        <span className="courier-card__label">{t.cdLabelCollect}</span>
                                                        <span className="courier-card__value" style={{ color: '#dc2626', fontWeight: 700 }}>₾{total.toFixed(2)}</span>
                                                    </div>
                                                )}
                                                {order.assignedToCourierAt && (
                                                    <div className="courier-card__row">
                                                        <span className="courier-card__label">{t.cdAssignedAt}</span>
                                                        <span className="courier-card__value">{fmtAssignedAt(order.assignedToCourierAt, lang)}</span>
                                                    </div>
                                                )}
                                                {order.description && <div className="courier-card__note">{order.description}</div>}
                                            </div>
                                            <div className="courier-card__footer">
                                                {order.status === 'CourierAssignedToPickUp' && (
                                                    <SwipeButton label={t.cdDeliverySwipeReturnPickup} variant="primary" disabled={isBusy}
                                                        onSwipe={() => onAct(order.id, () => markReturnPickedUp(token, order.id), t.cdDeliveryToastReturnPickup)} />
                                                )}
                                                {order.status === 'PickedUpFromRecipient' && (
                                                    <SwipeButton label={t.cdDeliverySwipeReturnWarehouse} variant="success" disabled={isBusy}
                                                        onSwipe={() => onAct(order.id, () => markReturnDeliveredWarehouse(token, order.id), t.cdDeliveryToastReturnWarehouse)} />
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <RouteToolbar
                stops={sortedPickups.filter(go => selectedIds.has(go.id)).map(go => ({ city: go.pickUpCity, district: go.pickUpDistrict, address: go.pickUpAddress, lat: go.pickUpLatitude, lon: go.pickUpLongitude }))}
                onClear={() => setSelectedIds(new Set())}
                geocodeCache={geocodeCache}
                coords={coords}
            />
        </div>
    );
}
