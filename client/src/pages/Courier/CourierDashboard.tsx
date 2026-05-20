import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/useLanguage';

import {
    fetchMyPickups, markPickingUp,
    markPickedUp, markDeliveredToWarehouse,
} from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import {
    fetchMyDeliveries, markOrderDelivering, markOrderDelivered,
    postponeOrder, retryDelivery,
} from '../../api/orders';
import type { CourierOrder, PostponeReason } from '../../api/orders';
import { POSTPONE_REASON_LABELS } from '../../api/orders';
import '../../styles/dashboard.css';
import { CourierHistoryPage } from './CourierHistoryPage';
import { CourierSettlementsPage } from './CourierSettlementsPage';

// ── Media query hook ───────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(
        () => window.matchMedia(`(max-width: ${breakpoint}px)`).matches
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [breakpoint]);
    return isMobile;
}

// ── SwipeButton ───────────────────────────────────────────────────────────────
type SwipeVariant = 'primary' | 'success';
interface SwipeButtonProps {
    label: string; onSwipe: () => void; disabled?: boolean; variant?: SwipeVariant;
}
function SwipeButton({ label, onSwipe, disabled = false, variant = 'primary' }: SwipeButtonProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [offset, setOffset] = useState(0);
    const [swipeState, setSwipeState] = useState<'idle' | 'confirmed'>('idle');
    const startXRef = useRef<number | null>(null);
    const [maxTravel, setMaxTravel] = useState(200);
    const HANDLE_SIZE = 48; const PADDING = 4; const THRESHOLD = 0.82;
    useEffect(() => {
        const el = trackRef.current; if (!el) return;
        const ro = new ResizeObserver(([e]) => setMaxTravel(e.contentRect.width - HANDLE_SIZE - PADDING * 2));
        ro.observe(el); return () => ro.disconnect();
    }, []);
    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled || swipeState === 'confirmed') return;
        startXRef.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (startXRef.current === null || swipeState === 'confirmed') return;
        const dx = Math.max(0, Math.min(e.clientX - startXRef.current, maxTravel));
        setOffset(dx);
        if (dx / maxTravel >= THRESHOLD) {
            startXRef.current = null; setOffset(maxTravel); setSwipeState('confirmed');
            setTimeout(() => { onSwipe(); setTimeout(() => { setSwipeState('idle'); setOffset(0); }, 500); }, 280);
        }
    };
    const handlePointerUp = () => { if (swipeState === 'confirmed') return; startXRef.current = null; setOffset(0); };
    const progress = maxTravel > 0 ? offset / maxTravel : 0;
    const isSnappingBack = swipeState === 'idle' && offset === 0;
    const palette: Record<SwipeVariant, { bg: string; fill: string; handle: string; labelColor: string }> = {
        primary: { bg: 'var(--color-accent-dim)', fill: 'var(--color-accent)', handle: 'var(--color-accent)', labelColor: 'var(--color-accent)' },
        success: { bg: '#d1fae5', fill: '#10b981', handle: '#059669', labelColor: '#065f46' },
    };
    const c = palette[variant];
    return (
        <div ref={trackRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
            style={{ position: 'relative', height: '56px', borderRadius: '100px',
                background: disabled ? 'var(--color-bg-3)' : c.bg, overflow: 'hidden', userSelect: 'none',
                cursor: disabled ? 'not-allowed' : 'ew-resize', opacity: disabled ? 0.55 : 1,
                touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${PADDING + HANDLE_SIZE + offset}px`,
                background: swipeState === 'confirmed' ? c.fill : `${c.fill}4d`, borderRadius: '100px',
                transition: isSnappingBack ? 'width 0.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none', pointerEvents: 'none' }} />
            {swipeState === 'idle' && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', paddingLeft: `${HANDLE_SIZE + PADDING * 2 + 8}px`,
                    fontSize: '0.875rem', fontWeight: 700, color: c.labelColor, letterSpacing: '0.02em',
                    pointerEvents: 'none', opacity: Math.max(0, 1 - progress * 2.5),
                    transition: isSnappingBack ? 'opacity 0.3s' : 'none' }}>{label}</span>
            )}
            {swipeState === 'confirmed' && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1.25rem', color: '#fff', fontWeight: 700, pointerEvents: 'none' }}>✓</span>
            )}
            <div style={{ position: 'absolute', top: PADDING, left: PADDING,
                width: `${HANDLE_SIZE}px`, height: `${HANDLE_SIZE}px`, borderRadius: '100px',
                background: disabled ? 'var(--color-border)' : c.handle,
                transform: `translateX(${offset}px)`,
                transition: isSnappingBack ? 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: swipeState === 'confirmed' ? '0 2px 12px rgba(0,0,0,0.22)' : '0 2px 8px rgba(0,0,0,0.15)',
                pointerEvents: 'none', fontSize: swipeState === 'confirmed' ? '1rem' : '1.5rem', color: '#fff', lineHeight: 1 }}>
                {swipeState === 'confirmed' ? '✓' : '›'}
            </div>
            {swipeState === 'idle' && offset === 0 && (
                <div style={{ position: 'absolute', top: '50%', left: `${PADDING + HANDLE_SIZE + 8}px`,
                    transform: 'translateY(-50%)', display: 'flex', gap: '3px', opacity: 0.35, pointerEvents: 'none' }}>
                    {['›','›','›'].map((ch, i) => <span key={i} style={{ fontSize: '0.7rem', color: c.labelColor }}>{ch}</span>)}
                </div>
            )}
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────
type DashView = 'pickups' | 'deliveries' | 'history' | 'settlements';

export function CourierDashboard() {
    const { user, token, signOut } = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { t } = useLanguage();

    const [view, setView] = useState<DashView>('pickups');
    const [pickups, setPickups] = useState<AdminGroupOrder[]>([]);
    const [pickupLoading, setPickupLoading] = useState(false);
    const [pickupError, setPickupError] = useState<string | null>(null);
    const [deliveries, setDeliveries] = useState<CourierOrder[]>([]);
    const [deliveriesLoading, setDeliveriesLoading] = useState(false);
    const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

    const loadPickups = async (silent = false) => {
        if (!token) return;
        if (!silent) { setPickupLoading(true); setPickupError(null); }
        try { setPickups(await fetchMyPickups(token)); }
        catch { if (!silent) setPickupError(t.cdPickupsLoading); }
        finally { if (!silent) setPickupLoading(false); }
    };
    const loadDeliveries = async (silent = false) => {
        if (!token) return;
        if (!silent) { setDeliveriesLoading(true); setDeliveriesError(null); }
        try { setDeliveries(await fetchMyDeliveries(token)); }
        catch { if (!silent) setDeliveriesError(t.cdDeliveriesLoading); }
        finally { if (!silent) setDeliveriesLoading(false); }
    };

    useEffect(() => {
        if (!token) return; let cancelled = false;
        const run = async () => {
            setPickupLoading(true); setPickupError(null);
            try { const d = await fetchMyPickups(token); if (!cancelled) setPickups(d); }
            catch { if (!cancelled) setPickupError(t.cdPickupsLoading); }
            finally { if (!cancelled) setPickupLoading(false); }
        };
        run(); return () => { cancelled = true; };
    }, [token]);

    useEffect(() => {
        if (!token) return; let cancelled = false;
        const run = async () => {
            setDeliveriesLoading(true); setDeliveriesError(null);
            try { const d = await fetchMyDeliveries(token); if (!cancelled) setDeliveries(d); }
            catch { if (!cancelled) setDeliveriesError(t.cdDeliveriesLoading); }
            finally { if (!cancelled) setDeliveriesLoading(false); }
        };
        run(); return () => { cancelled = true; };
    }, [token]);

    async function act(id: string, fn: () => Promise<void>, msg: string) {
        setBusyId(id);
        try { await fn(); showToast(msg); loadPickups(true); loadDeliveries(true); }
        catch (e: unknown) { showToast(e instanceof Error ? e.message : t.cdToastFailed); }
        finally { setBusyId(null); }
    }

    const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };
    const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'C';
    const fullName = user ? `${user.firstName} ${user.lastName}` : '';

    const pickupProps = { pickups, loading: pickupLoading, error: pickupError, onRefresh: loadPickups, busyId, token: token!, onAct: act };
    const deliveryProps = { deliveries, loading: deliveriesLoading, error: deliveriesError, busyId, token: token!, onAct: act };

    // ── Mobile ────────────────────────────────────────────────────────────────
    if (isMobile) {
        return (
            <div className="mobile-shell">
                <header className="mobile-topbar">
                    <div className="mobile-topbar__left">
                        <div className="mobile-topbar__logo">
                            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                                <rect width="28" height="28" rx="6" fill="currentColor" />
                                <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            DILO
                        </div>
                    </div>
                    <div className="mobile-topbar__right">
                        <div className="mobile-topbar__avatar">{initials}</div>
                        <span className="mobile-topbar__name">{fullName}</span>
                        <button className="mobile-topbar__signout" onClick={handleSignOut} title={t.signOut}>⎋</button>
                    </div>
                </header>
                <main className="mobile-content">
                    {toast && <div className="dashboard__toast">{toast}</div>}
                    <div className="mobile-tabs">
                        <button className={`mobile-tab${view === 'pickups' ? ' mobile-tab--active' : ''}`} onClick={() => setView('pickups')}>{t.cdTabPickups}</button>
                        <button className={`mobile-tab${view === 'deliveries' ? ' mobile-tab--active' : ''}`} onClick={() => setView('deliveries')}>{t.cdTabDeliveries}</button>
                        <button className={`mobile-tab${view === 'history' ? ' mobile-tab--active' : ''}`} onClick={() => setView('history')}>{t.cdTabHistory}</button>
                        <button className={`mobile-tab${view === 'settlements' ? ' mobile-tab--active' : ''}`} onClick={() => setView('settlements')}>{t.cdTabPay}</button>
                    </div>
                    {view === 'pickups'     && <PickupsPanel    {...pickupProps} />}
                    {view === 'deliveries'  && <DeliveriesPanel {...deliveryProps} />}
                    {view === 'history'     && <CourierHistoryPage />}
                    {view === 'settlements' && <CourierSettlementsPage />}
                </main>
            </div>
        );
    }

    // ── Desktop ───────────────────────────────────────────────────────────────
    return (
        <div className="dashboard">
            <aside className="sidebar">
                <div className="sidebar__top">
                    <div className="sidebar__logo">
                        <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                            <rect width="28" height="28" rx="6" fill="currentColor" />
                            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        DILO
                    </div>
                    <nav className="sidebar__nav">
                        <button className={`sidebar__link${view === 'pickups' ? ' sidebar__link--active' : ''}`} onClick={() => setView('pickups')}>{t.cdTabPickups}</button>
                        <button className={`sidebar__link${view === 'deliveries' ? ' sidebar__link--active' : ''}`} onClick={() => setView('deliveries')}>{t.cdTabDeliveries}</button>
                        <button className={`sidebar__link${view === 'history' ? ' sidebar__link--active' : ''}`} onClick={() => setView('history')}>{t.cdTabHistory}</button>
                        <button className={`sidebar__link${view === 'settlements' ? ' sidebar__link--active' : ''}`} onClick={() => setView('settlements')}>{t.cdTabSettlements}</button>
                    </nav>
                </div>
                <div className="sidebar__bottom">
                    <div className="sidebar__user">
                        <div className="sidebar__avatar">{initials}</div>
                        <div className="sidebar__user-info">
                            <div className="sidebar__user-name">{fullName}</div>
                            <div className="sidebar__user-handle">{t.cdRoleCourier}</div>
                        </div>
                    </div>
                    <button className="sidebar__logout" onClick={handleSignOut}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {t.signOut}
                    </button>
                </div>
            </aside>
            <main className="dashboard__main">
                {toast && <div className="dashboard__toast">{toast}</div>}
                {view === 'pickups'     && <PickupsPanel    {...pickupProps} />}
                {view === 'deliveries'  && <DeliveriesPanel {...deliveryProps} />}
                {view === 'history'     && <CourierHistoryPage />}
                {view === 'settlements' && <CourierSettlementsPage />}
            </main>
        </div>
    );
}

// ── Pickups Panel ─────────────────────────────────────────────────────────────
interface PickupsPanelProps {
    pickups: AdminGroupOrder[]; loading: boolean; error: string | null;
    onRefresh: () => void; busyId: string | null; token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

function PickupsPanel({ pickups, loading, error, onRefresh, busyId, token, onAct }: PickupsPanelProps) {
    const { t } = useLanguage();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());


    const toggle = (id: string) =>
        setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

    if (loading) return <div className="dashboard__loader">{t.cdPickupsLoading}</div>;
    if (error)   return <div className="dashboard__error">{error} <button onClick={onRefresh}>{t.cdRetry}</button></div>;
    if (!pickups.length) return <div className="dashboard__empty">{t.cdPickupsEmpty}</div>;

    return (
        <div className="dashboard__section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 className="dashboard__title" style={{ margin: 0 }}>{t.cdPickupsTitle}</h2>
                {expandedIds.size > 0 && (
                    <button onClick={() => setExpandedIds(new Set())}
                        style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                        {t.cdCollapseAll}
                    </button>
                )}
            </div>
            <div className="courier-cards">
                {pickups.map(go => {
                    const isExpanded = expandedIds.has(go.id);
                    return (
                        <div key={go.id} className="courier-card">
                            <button className="courier-card__collapse-row" onClick={() => toggle(go.id)} aria-expanded={isExpanded}>
                                <div className="courier-card__collapse-icon">📦</div>
                                <div className="courier-card__collapse-info">
                                    <span className="courier-card__collapse-primary">{go.pickUpCity}, {go.pickUpDistrict},</span>
                                    <span className="courier-card__collapse-secondary">{go.pickUpAddress}</span>
                                </div>
                                <div className="courier-card__collapse-right">
                                    <span className="courier-card__collapse-chevron" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                                </div>
                            </button>
                            {isExpanded && (
                                <>
                                    <div className="courier-card__body">
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">🏪 {t.cdLabelSender}</span>
                                            <span className="courier-card__value">{go.senderBusinessName || `${go.senderFirstName} ${go.senderLastName}`}</span>
                                        </div>
                                        <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelLocation}</span><span className="courier-card__value">{go.pickUpCity}, {go.pickUpDistrict}</span></div>
                                        <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelAddress}</span><span className="courier-card__value">{go.pickUpAddress}</span></div>
                                        <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelPackages}</span><span className="courier-card__value">{t.cdLabelPackageCount(go.numberOfPackages)}</span></div>
                                        {go.senderPhone && (
                                            <div className="courier-card__row">
                                                <span className="courier-card__label">{t.cdLabelPhone}</span>
                                                <a href={`tel:${go.senderPhone}`} className="courier-card__phone-link">
                                                    📞 {go.senderPhone}
                                                </a>
                                            </div>
                                        )}
                                        {go.whenPackagePickedUpDate && <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelScheduled}</span><span className="courier-card__value">{new Date(go.whenPackagePickedUpDate).toLocaleDateString()}</span></div>}
                                        {go.note && <div className="courier-card__note">{go.note}</div>}
                                    </div>
                                    <div className="courier-card__footer">
                                        {go.status === 'CourierAssignedToPickUp' && <SwipeButton label={t.cdPickupSwipeOnWay} variant="primary" disabled={busyId === go.id} onSwipe={() => onAct(go.id, () => markPickingUp(token, go.id), t.cdPickupToastOnWay)} />}
                                        {go.status === 'CourierOnTheWayToPickUp' && <SwipeButton label={t.cdPickupSwipePickedUp} variant="primary" disabled={busyId === go.id} onSwipe={() => onAct(go.id, () => markPickedUp(token, go.id), t.cdPickupToastPickedUp)} />}
                                        {go.status === 'CourierDeliveringToWarehouse' && <SwipeButton label={t.cdPickupSwipeToWarehouse} variant="success" disabled={busyId === go.id} onSwipe={() => onAct(go.id, () => markDeliveredToWarehouse(token, go.id), t.cdPickupToastToWarehouse)} />}
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

// ── Deliveries Panel ──────────────────────────────────────────────────────────
interface DeliveriesPanelProps {
    deliveries: CourierOrder[]; loading: boolean; error: string | null;
    busyId: string | null; token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

function DeliveriesPanel({ deliveries, loading, error, busyId, token, onAct }: DeliveriesPanelProps) {
    const { t } = useLanguage();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [postponingId, setPostponingId] = useState<string | null>(null);
    const [collectConfirmOrderId, setCollectConfirmOrderId] = useState<string | null>(null);

    //const STATUS_LABEL: Record<string, string> = {
    //    CourierAssignedToDeliver:             t.cdDeliveryStatusAssigned,
    //    CourierDeliveringTheOrderToRecipient: t.cdDeliveryStatusInTransit,
    //    DeliveryPostponed:                    t.cdDeliveryStatusPostponed,
    //};

    const toggle = (id: string) =>
        setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

    if (loading) return <div className="dashboard__loader">{t.cdDeliveriesLoading}</div>;
    if (error)   return <div className="dashboard__error">{error}</div>;
    if (!deliveries.length) return <div className="dashboard__empty">{t.cdDeliveriesEmpty}</div>;

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
                {expandedIds.size > 0 && (
                    <button onClick={() => setExpandedIds(new Set())}
                        style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                        {t.cdCollapseAll}
                    </button>
                )}
            </div>
            <div className="courier-cards">
                {deliveries.map(order => {
                    const isBusy = busyId === order.id;
                    const isExpanded = expandedIds.has(order.id);
                    const mustCollect = needsCollect(order);
                    const total = collectTotal(order);
                    return (
                        <div key={order.id} className="courier-card" style={{ position: 'relative' }}>
                            {/* Collapsed row */}
                            <button className="courier-card__collapse-row" onClick={() => toggle(order.id)} aria-expanded={isExpanded}>
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
                                        <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelLocation}</span><span className="courier-card__value">{order.recipientCity}, {order.recipientDistrict},</span></div>
                                        <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelAddress}</span><span className="courier-card__value">{order.recipientAddress}</span></div>
                                        <div className="courier-card__row">
                                            <span className="courier-card__label">{t.cdLabelPayment}</span>
                                            <span className="courier-card__value">
                                                {order.productPaymentStatus === 'Paid' ? t.cdDeliveryPayPaid : t.cdDeliveryPayCollect(order.whoPaysForCompanyService === 'Recipient')}
                                            </span>
                                        </div>
                                        {mustCollect && <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelCollect}</span><span className="courier-card__value" style={{ color: '#dc2626', fontWeight: 700 }}>₾{total.toFixed(2)}</span></div>}
                                        {order.deliveryDateFrom && order.deliveryDateTo && (
                                            <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelWindow}</span><span className="courier-card__value">{new Date(order.deliveryDateFrom).toLocaleDateString()} – {new Date(order.deliveryDateTo).toLocaleDateString()}</span></div>
                                        )}
                                        {order.status === 'DeliveryPostponed' && order.postponeReason && (
                                            <div className="courier-card__row"><span className="courier-card__label">{t.cdLabelPostponed}</span><span className="courier-card__value" style={{ color: '#f97316' }}>{POSTPONE_REASON_LABELS[order.postponeReason]}</span></div>
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
                                                    onSwipe={() => { if (mustCollect) { setCollectConfirmOrderId(order.id); } else { onAct(order.id, () => markOrderDelivered(token, order.id), t.cdDeliveryToastDelivered); } }} />
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
        </div>
    );
}

// ── CollectConfirmModal ───────────────────────────────────────────────────────
interface CollectConfirmModalProps { order: CourierOrder; isBusy: boolean; onCancel: () => void; onConfirm: () => void; }

function CollectConfirmModal({ order, isBusy, onCancel, onConfirm }: CollectConfirmModalProps) {
    const { t } = useLanguage();
    const hasProductAmount = order.productPaymentStatus === 'NotPaid' && order.amountToCollectForPackage != null && order.amountToCollectForPackage > 0;
    const hasServiceFee = order.companyServicePrice > 0 && order.whoPaysForCompanyService === 'Recipient';
    const total = hasProductAmount ? order.amountToCollectForPackage! + order.companyServicePrice : order.companyServicePrice;
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.50)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--color-bg)', borderRadius: '14px', padding: '24px 20px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.28)', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 14px' }}>💰</div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700 }}>{t.cdCollectTitle}</h3>
                <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{t.cdCollectSubtitle}</p>
                <div style={{ margin: '0 0 10px', padding: '12px 14px', borderRadius: '8px', background: 'var(--color-bg-2, #f9fafb)', border: '1px solid var(--color-border)', textAlign: 'left', fontSize: '0.85rem' }}>
                    {hasProductAmount && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>{t.cdCollectParcel}</span>
                            <span style={{ fontWeight: 600 }}>₾{order.amountToCollectForPackage!.toFixed(2)}</span>
                        </div>
                    )}
                    {hasServiceFee && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: hasProductAmount ? 6 : 0, borderTop: hasProductAmount ? '1px dashed var(--color-border)' : 'none' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>{t.cdCollectFee}</span>
                            <span style={{ fontWeight: 600 }}>₾{order.companyServicePrice.toFixed(2)}</span>
                        </div>
                    )}
                </div>
                <div style={{ margin: '0 0 20px', padding: '12px 16px', borderRadius: '10px', background: '#fef9c3', border: '1px solid #fde047', width: '100%' }}>
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginBottom: 2, fontWeight: 700, letterSpacing: '0.05em' }}>{t.cdCollectTotal}</div>
                    <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#92400e', letterSpacing: '-0.5px' }}>₾{total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCancel} disabled={isBusy} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>{t.cdCollectNo}</button>
                    <button disabled={isBusy} onClick={onConfirm} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', cursor: isBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: isBusy ? 0.6 : 1 }}>{t.cdCollectYes}</button>
                </div>
            </div>
        </div>
    );
}

// ── PostponeModal ─────────────────────────────────────────────────────────────
interface PostponeModalProps { isBusy: boolean; onCancel: () => void; onConfirm: (reason: PostponeReason) => void; }

function PostponeModal({ isBusy, onCancel, onConfirm }: PostponeModalProps) {
    const { t } = useLanguage();
    const [selected, setSelected] = useState<PostponeReason | null>(null);
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.45)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--color-bg)', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700 }}>{t.cdPostponeTitle}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {(Object.keys(POSTPONE_REASON_LABELS) as PostponeReason[]).map(reason => (
                        <button key={reason} onClick={() => setSelected(reason)} style={{ padding: '10px 12px', borderRadius: '8px', border: selected === reason ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', background: selected === reason ? 'var(--color-accent-dim)' : 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', fontWeight: selected === reason ? 600 : 400 }}>
                            {POSTPONE_REASON_LABELS[reason]}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem' }}>{t.cancel}</button>
                    <button disabled={!selected || isBusy} onClick={() => selected && onConfirm(selected)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: selected ? '#f97316' : 'var(--color-bg-3)', color: selected ? '#fff' : 'var(--color-text-muted)', cursor: selected ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.875rem' }}>{t.goConfirm}</button>
                </div>
            </div>
        </div>
    );
}
