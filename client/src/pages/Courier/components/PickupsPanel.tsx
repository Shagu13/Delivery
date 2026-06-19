import { useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import {
    markPickingUp, markPickedUp, markDeliveredToWarehouse,
} from '../../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../../api/adminGroupOrders';
import { SwipeButton } from './SwipeButton';
import { AddressMapLink } from './AddressMapLink';
import { useGeoSort, distanceToAddress } from './useGeoSort';
import { RouteToolbar } from './RouteToolbar';

export interface PickupsPanelProps {
    pickups: AdminGroupOrder[];
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    busyId: string | null;
    token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
    onBulkAct: (ids: string[], fn: (id: string) => Promise<void>, msg: string) => Promise<void>;
}

export function PickupsPanel({ pickups, loading, error, onRefresh, busyId, token, onAct, onBulkAct }: PickupsPanelProps) {
    const { t } = useLanguage();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    // The three pickup stages, each with its API call + button label + success toast.
    // A bulk action is offered only when every selected pickup shares one status.
    const bulkActionFor = (status: string) => {
        switch (status) {
            case 'CourierAssignedToPickUp':
                return { fn: (id: string) => markPickingUp(token, id),          label: t.cdPickupSwipeOnWay,      toast: t.cdPickupToastOnWay,      variant: 'primary' as const };
            case 'CourierOnTheWayToPickUp':
                return { fn: (id: string) => markPickedUp(token, id),            label: t.cdPickupSwipePickedUp,   toast: t.cdPickupToastPickedUp,   variant: 'primary' as const };
            case 'CourierDeliveringToWarehouse':
                return { fn: (id: string) => markDeliveredToWarehouse(token, id), label: t.cdPickupSwipeToWarehouse, toast: t.cdPickupToastToWarehouse, variant: 'success' as const };
            default:
                return null;
        }
    };

    const addresses = useMemo(
        () => pickups.map(go => ({ address: go.pickUpAddress, district: go.pickUpDistrict, city: go.pickUpCity })),
        [pickups]
    );
    const { sortMode, setSortMode, locState, coords, geocodeCache, geocoding, retryLocation, refreshLocation } = useGeoSort(addresses);

    const toggle = (id: string) =>
        setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
    const toggleSelect = (id: string) =>
        setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

    if (loading) return <div className="dashboard__loader">{t.cdPickupsLoading}</div>;
    if (error)   return <div className="dashboard__error">{error} <button onClick={onRefresh}>{t.cdRetry}</button></div>;
    if (!pickups.length) return <div className="dashboard__empty">{t.cdPickupsEmpty}</div>;

    const distanceTo = (go: AdminGroupOrder) => {
        if (!coords) return Infinity;
        return distanceToAddress(coords, go.pickUpAddress, go.pickUpDistrict, go.pickUpCity, geocodeCache);
    };

    const sortedPickups = [...pickups].sort((a, b) =>
        sortMode === 'nearest'
            ? distanceTo(a) - distanceTo(b)
            : a.pickUpDistrict.localeCompare(b.pickUpDistrict)
    );

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
    for (const p of pickups) { const k = customerKey(p); customerCounts[k] = (customerCounts[k] ?? 0) + 1; }
    const selectCustomer = (go: AdminGroupOrder) => {
        const key = customerKey(go);
        setSelectedIds(prev => {
            const n = new Set(prev);
            pickups.forEach(p => { if (customerKey(p) === key) n.add(p.id); });
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
            <div className="courier-cards">
                {sortedPickups.map(go => {
                    const isExpanded = expandedIds.has(go.id);
                    const isSelected = selectedIds.has(go.id);
                    return (
                        <div key={go.id} className={`courier-card${isSelected ? ' courier-card--selected' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(go.id)}
                                    style={{ width: 18, height: 18, marginLeft: 12, cursor: 'pointer', accentColor: 'var(--color-accent)', flexShrink: 0 }} />
                                <button className="courier-card__collapse-row" style={{ flex: 1 }} onClick={() => toggle(go.id)} aria-expanded={isExpanded}>
                                    <div className="courier-card__collapse-icon">📦</div>
                                    <div className="courier-card__collapse-info">
                                        <span className="courier-card__collapse-primary">{go.pickUpCity}, {go.pickUpDistrict},</span>
                                        <span className="courier-card__collapse-secondary">{go.pickUpAddress}</span>
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
                                            <SwipeButton label={t.cdPickupSwipeOnWay} variant="primary" disabled={busyId === go.id}
                                                onSwipe={() => onAct(go.id, () => markPickingUp(token, go.id), t.cdPickupToastOnWay)} />
                                        )}
                                        {go.status === 'CourierOnTheWayToPickUp' && (
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
                    );
                })}
            </div>
            <RouteToolbar
                stops={sortedPickups.filter(go => selectedIds.has(go.id)).map(go => ({ city: go.pickUpCity, district: go.pickUpDistrict, address: go.pickUpAddress }))}
                onClear={() => setSelectedIds(new Set())}
                geocodeCache={geocodeCache}
                coords={coords}
            />
        </div>
    );
}
