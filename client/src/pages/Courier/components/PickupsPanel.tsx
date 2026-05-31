import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import {
    markPickingUp, markPickedUp, markDeliveredToWarehouse,
} from '../../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../../api/adminGroupOrders';
import { SwipeButton } from './SwipeButton';
import { mapUrl } from './mapUtils';
import { useGeoSort, distanceToAddress } from './useGeoSort';

export interface PickupsPanelProps {
    pickups: AdminGroupOrder[];
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    busyId: string | null;
    token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

export function PickupsPanel({ pickups, loading, error, onRefresh, busyId, token, onAct }: PickupsPanelProps) {
    const { t } = useLanguage();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const addresses = pickups.map(go => ({ address: go.pickUpAddress, district: go.pickUpDistrict, city: go.pickUpCity }));
    const { sortMode, setSortMode, locState, coords, geocodeCache, geocoding } = useGeoSort(addresses);

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

    return (
        <div className="dashboard__section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 className="dashboard__title" style={{ margin: 0 }}>{t.cdPickupsTitle}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {locState === 'locating' && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.cdLocating}</span>}
                    {locState === 'denied'   && <span style={{ fontSize: '0.75rem', color: '#f97316' }}>{t.cdLocDenied}</span>}
                    {locState === 'ready' && geocoding && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.cdGeocoding}</span>}
                    <button
                        onClick={() => setSortMode(m => m === 'district' ? 'nearest' : 'district')}
                        style={{ fontSize: '0.75rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '3px 8px', color: 'var(--color-text-muted)' }}>
                        {sortMode === 'district' ? t.cdSortDistrict : t.cdSortNearest}
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
                                            <a href={mapUrl(go.pickUpCity, go.pickUpDistrict, go.pickUpAddress)} target="_blank" rel="noopener noreferrer" className="courier-card__map-link">
                                                📍 {go.pickUpAddress}
                                            </a>
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
        </div>
    );
}
