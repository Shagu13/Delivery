import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useNavigate } from 'react-router-dom';
import {
    fetchMyPickups, markPickingUp,
    markPickedUp, markDeliveredToWarehouse,
} from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import {
    fetchMyDeliveries, markOrderReceived, markOrderDelivered,
} from '../../api/orders';
import type { CourierOrder } from '../../api/orders';
import '../../styles/dashboard.css';


// ── Media query hook ──────────────────────────────────────────────────────────

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
// Replaces tap buttons to prevent accidental triggers on mobile.
// Desktop users can still drag to confirm — it works with mouse too.

type SwipeVariant = 'primary' | 'success';

interface SwipeButtonProps {
    label: string;
    onSwipe: () => void;
    disabled?: boolean;
    variant?: SwipeVariant;
}

function SwipeButton({ label, onSwipe, disabled = false, variant = 'primary' }: SwipeButtonProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [offset, setOffset] = useState(0);
    const [swipeState, setSwipeState] = useState<'idle' | 'confirmed'>('idle');
    const startXRef = useRef<number | null>(null);

    const HANDLE_SIZE = 48;
    const PADDING = 4;
    const THRESHOLD = 0.82;

    const getMaxTravel = useCallback(() => {
        if (!trackRef.current) return 200;
        return trackRef.current.offsetWidth - HANDLE_SIZE - PADDING * 2;
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled || swipeState === 'confirmed') return;
        startXRef.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (startXRef.current === null || swipeState === 'confirmed') return;
        const maxTravel = getMaxTravel();
        const dx = Math.max(0, Math.min(e.clientX - startXRef.current, maxTravel));
        setOffset(dx);

        if (dx / maxTravel >= THRESHOLD) {
            startXRef.current = null;
            setOffset(maxTravel);
            setSwipeState('confirmed');
            // Brief confirmed flash, then fire
            setTimeout(() => {
                onSwipe();
                setTimeout(() => {
                    setSwipeState('idle');
                    setOffset(0);
                }, 500);
            }, 280);
        }
    };

    const handlePointerUp = () => {
        if (swipeState === 'confirmed') return;
        startXRef.current = null;
        setOffset(0); // spring back via CSS transition
    };

    const maxTravel = getMaxTravel();
    const progress = maxTravel > 0 ? offset / maxTravel : 0;
    const isSnappingBack = swipeState === 'idle' && offset === 0;

    // Colour tokens per variant
    const palette: Record<SwipeVariant, { bg: string; fill: string; handle: string; labelColor: string }> = {
        primary: {
            bg: 'var(--color-accent-dim)',
            fill: 'var(--color-accent)',
            handle: 'var(--color-accent)',
            labelColor: 'var(--color-accent)',
        },
        success: {
            bg: '#d1fae5',
            fill: '#10b981',
            handle: '#059669',
            labelColor: '#065f46',
        },
    };
    const c = palette[variant];

    return (
        <div
            ref={trackRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
                position: 'relative',
                height: '56px',
                borderRadius: '100px',
                background: disabled ? 'var(--color-bg-3)' : c.bg,
                overflow: 'hidden',
                userSelect: 'none',
                cursor: disabled ? 'not-allowed' : 'ew-resize',
                opacity: disabled ? 0.55 : 1,
                touchAction: 'none',
                WebkitTapHighlightColor: 'transparent',
            }}
        >
            {/* Progress fill */}
            <div
                style={{
                    position: 'absolute',
                    top: 0, left: 0, bottom: 0,
                    width: `${PADDING + HANDLE_SIZE + offset}px`,
                    background: swipeState === 'confirmed'
                        ? c.fill
                        : `${c.fill}4d`,   // ~30% opacity while dragging
                    borderRadius: '100px',
                    transition: isSnappingBack
                        ? 'width 0.4s cubic-bezier(0.34,1.56,0.64,1)'
                        : 'none',
                    pointerEvents: 'none',
                }}
            />

            {/* Slide hint text — fades out as handle moves */}
            {swipeState === 'idle' && (
                <span
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingLeft: `${HANDLE_SIZE + PADDING * 2 + 8}px`,
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: c.labelColor,
                        letterSpacing: '0.02em',
                        pointerEvents: 'none',
                        opacity: Math.max(0, 1 - progress * 2.5),
                        transition: isSnappingBack ? 'opacity 0.3s' : 'none',
                    }}
                >
                    {label}
                </span>
            )}

            {/* Confirmed checkmark */}
            {swipeState === 'confirmed' && (
                <span
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.25rem',
                        color: '#fff',
                        fontWeight: 700,
                        pointerEvents: 'none',
                    }}
                >
                    ✓
                </span>
            )}

            {/* Drag handle */}
            <div
                style={{
                    position: 'absolute',
                    top: PADDING,
                    left: PADDING,
                    width: `${HANDLE_SIZE}px`,
                    height: `${HANDLE_SIZE}px`,
                    borderRadius: '100px',
                    background: disabled ? 'var(--color-border)' : c.handle,
                    transform: `translateX(${offset}px)`,
                    transition: isSnappingBack
                        ? 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)'
                        : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: swipeState === 'confirmed'
                        ? '0 2px 12px rgba(0,0,0,0.22)'
                        : '0 2px 8px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                    fontSize: swipeState === 'confirmed' ? '1rem' : '1.5rem',
                    color: '#fff',
                    lineHeight: 1,
                }}
            >
                {swipeState === 'confirmed' ? '✓' : '›'}
            </div>

            {/* "Swipe" hint arrow row — only shows when idle & not dragging */}
            {swipeState === 'idle' && offset === 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: `${PADDING + HANDLE_SIZE + 8}px`,
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        gap: '3px',
                        opacity: 0.35,
                        pointerEvents: 'none',
                    }}
                >
                    {['›', '›', '›'].map((ch, i) => (
                        <span key={i} style={{ fontSize: '0.7rem', color: c.labelColor }}>{ch}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

export function CourierDashboard() {
    const { user, token, signOut } = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();

    const [view, setView] = useState<'pickups' | 'deliveries'>('pickups');

    const [pickups, setPickups] = useState<AdminGroupOrder[]>([]);
    const [pickupLoading, setPickupLoading] = useState(false);
    const [pickupError, setPickupError] = useState<string | null>(null);

    const [deliveries, setDeliveries] = useState<CourierOrder[]>([]);
    const [deliveriesLoading, setDeliveriesLoading] = useState(false);
    const [deliveriesError, setDeliveriesError] = useState<string | null>(null);

    const [busyId, setBusyId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    const loadPickups = useCallback(async () => {
        if (!token) return;
        setPickupLoading(true); setPickupError(null);
        try { setPickups(await fetchMyPickups(token)); }
        catch { setPickupError('Failed to load pickups.'); }
        finally { setPickupLoading(false); }
    }, [token]);

    const loadDeliveries = useCallback(async () => {
        if (!token) return;
        setDeliveriesLoading(true); setDeliveriesError(null);
        try { setDeliveries(await fetchMyDeliveries(token)); }
        catch { setDeliveriesError('Failed to load deliveries.'); }
        finally { setDeliveriesLoading(false); }
    }, [token]);


    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadPickups(); }, [loadPickups]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

    async function act(id: string, fn: () => Promise<void>, msg: string) {
        setBusyId(id);
        try {
            await fn();
            showToast(msg);
            loadPickups();
            loadDeliveries();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Action failed.');
        } finally {
            setBusyId(null);
        }
    }

    const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };
    const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'C';

    // ── Shared panel props ────────────────────────────────────────────────────
    const pickupProps = {
        pickups, loading: pickupLoading, error: pickupError,
        onRefresh: loadPickups, busyId, token: token!, onAct: act,
    };
    const deliveryProps = {
        deliveries, loading: deliveriesLoading, error: deliveriesError,
        busyId, token: token!, onAct: act,
    };

    if (isMobile) {
        return (
            <div className="mobile-shell">
                {/* Top bar */}
                <header className="mobile-topbar">
                    <div className="mobile-topbar__left">
                        <div className="mobile-topbar__logo">
                            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                                <rect width="28" height="28" rx="6" fill="currentColor" />
                                <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            Delivery
                        </div>
                        <span className="mobile-topbar__badge">Courier</span>
                    </div>
                    <div className="mobile-topbar__right">
                        <span className="mobile-topbar__avatar">{initials}</span>
                        <button className="mobile-topbar__signout" onClick={handleSignOut}>Sign out</button>
                    </div>
                </header>

                {/* Content */}
                <main className="mobile-content">
                    {toast && <div className="dashboard__toast">{toast}</div>}
                    {view === 'pickups' && <PickupsPanel    {...pickupProps} />}
                    {view === 'deliveries' && <DeliveriesPanel {...deliveryProps} />}
                </main>

                {/* Bottom tab bar */}
                <nav className="mobile-tabs">
                    <button
                        className={`mobile-tab ${view === 'pickups' ? 'mobile-tab--active' : ''}`}
                        onClick={() => setView('pickups')}
                    >
                        <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                        Pickups
                        {pickups.length > 0 && (
                            <span style={{
                                background: 'var(--color-accent)', color: '#fff',
                                borderRadius: '100px', fontSize: '0.6rem', fontWeight: 700,
                                padding: '1px 6px', lineHeight: 1.5,
                            }}>
                                {pickups.length}
                            </span>
                        )}
                    </button>
                    <button
                        className={`mobile-tab ${view === 'deliveries' ? 'mobile-tab--active' : ''}`}
                        onClick={() => setView('deliveries')}
                    >
                        <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                            <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Deliveries
                        {deliveries.length > 0 && (
                            <span style={{
                                background: 'var(--color-accent)', color: '#fff',
                                borderRadius: '100px', fontSize: '0.6rem', fontWeight: 700,
                                padding: '1px 6px', lineHeight: 1.5,
                            }}>
                                {deliveries.length}
                            </span>
                        )}
                    </button>
                </nav>
            </div>
        );
    }

    // ── Desktop layout (unchanged) ────────────────────────────────────────────
    return (
        <div className="dashboard">
            <aside className="sidebar">
                <div className="sidebar__logo">
                    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                        <rect width="28" height="28" rx="6" fill="currentColor" />
                        <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Delivery
                </div>
                <span className="sidebar__role-badge">Courier</span>
                <div className="sidebar__divider" />
                <nav className="sidebar__nav">
                    <button
                        className={`sidebar__link ${view === 'pickups' ? 'sidebar__link--active' : ''}`}
                        onClick={() => setView('pickups')}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                        My Pickups
                    </button>
                    <button
                        className={`sidebar__link ${view === 'deliveries' ? 'sidebar__link--active' : ''}`}
                        onClick={() => setView('deliveries')}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        My Deliveries
                    </button>
                </nav>
                <div className="sidebar__bottom">
                    <div className="sidebar__user">
                        <span className="sidebar__avatar">{initials}</span>
                        <span className="sidebar__username">{user?.firstName} {user?.lastName}</span>
                    </div>
                    <button className="sidebar__signout" onClick={handleSignOut}>Sign out</button>
                </div>
            </aside>

            <main className="dashboard__main">
                {toast && <div className="dashboard__toast">{toast}</div>}
                {view === 'pickups' && <PickupsPanel    {...pickupProps} />}
                {view === 'deliveries' && <DeliveriesPanel {...deliveryProps} />}
            </main>
        </div>
    );
}

// ── Pickups Panel ─────────────────────────────────────────────────────────────

interface PickupsPanelProps {
    pickups: AdminGroupOrder[];
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    busyId: string | null;
    token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

function PickupsPanel({ pickups, loading, error, onRefresh, busyId, token, onAct }: PickupsPanelProps) {
    if (loading) return <div className="dashboard__loader">Loading pickups…</div>;
    if (error) return <div className="dashboard__error">{error} <button onClick={onRefresh}>Retry</button></div>;
    if (!pickups.length) return <div className="dashboard__empty">No active pickups assigned to you.</div>;

    return (
        <div className="dashboard__section">
            <h2 className="dashboard__title">Active Pickups</h2>
            <div className="courier-cards">
                {pickups.map(go => (
                    <div key={go.id} className="courier-card">
                        <div className="courier-card__header">
                            <div className="courier-card__business">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <rect x="1" y="5" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                                    <path d="M5 5V3.5A1.5 1.5 0 016.5 2h3A1.5 1.5 0 0111 3.5V5" stroke="currentColor" strokeWidth="1.4" />
                                </svg>
                                {go.senderBusinessName || `${go.senderFirstName} ${go.senderLastName}`}
                            </div>
                        </div>
                        <div className="courier-card__body">
                            <div className="courier-card__row">
                                <span className="courier-card__label">📍 Location</span>
                                <span className="courier-card__value">{go.pickUpCity}, {go.pickUpDistrict}</span>
                            </div>
                            <div className="courier-card__row">
                                <span className="courier-card__label">🏠 Address</span>
                                <span className="courier-card__value">{go.pickUpAddress}</span>
                            </div>
                            <div className="courier-card__row">
                                <span className="courier-card__label">📦 Packages</span>
                                <span className="courier-card__value">{go.numberOfPackages} package{go.numberOfPackages !== 1 ? 's' : ''}</span>
                            </div>
                            {go.senderPhone && (
                                <div className="courier-card__row">
                                    <span className="courier-card__label">📞 Phone</span>
                                    <span className="courier-card__value">{go.senderPhone}</span>
                                </div>
                            )}
                            {go.whenPackagePickedUpDate && (
                                <div className="courier-card__row">
                                    <span className="courier-card__label">📅 Scheduled</span>
                                    <span className="courier-card__value">
                                        {new Date(go.whenPackagePickedUpDate).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                            {go.note && <div className="courier-card__note">{go.note}</div>}
                        </div>
                        <div className="courier-card__footer">
                            {go.status === 'CourierAssignedToPickUp' && (
                                <SwipeButton
                                    label="🚗 Swipe — On My Way"
                                    variant="primary"
                                    disabled={busyId === go.id}
                                    onSwipe={() => onAct(go.id, () => markPickingUp(token, go.id), 'On the way to pickup.')}
                                />
                            )}
                            {go.status === 'CourierOnTheWayToPickUp' && (
                                <SwipeButton
                                    label="✅ Swipe — Picked Up"
                                    variant="primary"
                                    disabled={busyId === go.id}
                                    onSwipe={() => onAct(go.id, () => markPickedUp(token, go.id), 'Packages picked up.')}
                                />
                            )}
                            {go.status === 'CourierDeliveringToWarehouse' && (
                                <SwipeButton
                                    label="🏭 Swipe — Delivered to Warehouse"
                                    variant="success"
                                    disabled={busyId === go.id}
                                    onSwipe={() => onAct(go.id, () => markDeliveredToWarehouse(token, go.id), 'Delivered to warehouse.')}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Deliveries Panel ──────────────────────────────────────────────────────────

interface DeliveriesPanelProps {
    deliveries: CourierOrder[];
    loading: boolean;
    error: string | null;
    busyId: string | null;
    token: string;
    onAct: (id: string, fn: () => Promise<void>, msg: string) => Promise<void>;
}

function DeliveriesPanel({ deliveries, loading, error, busyId, token, onAct }: DeliveriesPanelProps) {
    if (loading) return <div className="dashboard__loader">Loading deliveries…</div>;
    if (error) return <div className="dashboard__error">{error}</div>;
    if (!deliveries.length) return <div className="dashboard__empty">No active deliveries assigned to you.</div>;

    return (
        <div className="dashboard__section">
            <h2 className="dashboard__title">Active Deliveries</h2>
            <div className="courier-cards">
                {deliveries.map(order => {
                    const isBusy = busyId === order.id;
                    return (
                        <div key={order.id} className="courier-card">
                            <div className="courier-card__header">
                                <div className="courier-card__business" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {order.trackingNumber}
                                    {order.isFragile && (
                                        <span title="Fragile" style={{ marginLeft: 8, color: '#f97316', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
                                            ⚠ Fragile
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="courier-card__body">
                                <div className="courier-card__row">
                                    <span className="courier-card__label">👤 Recipient</span>
                                    <span className="courier-card__value">{order.recipientFirstName} {order.recipientLastName}</span>
                                </div>
                                <div className="courier-card__row">
                                    <span className="courier-card__label">📞 Phone</span>
                                    <span className="courier-card__value">{order.recipientPhone}</span>
                                </div>
                                <div className="courier-card__row">
                                    <span className="courier-card__label">📍 Location</span>
                                    <span className="courier-card__value">{order.recipientCity}, {order.recipientDistrict}</span>
                                </div>
                                <div className="courier-card__row">
                                    <span className="courier-card__label">🏠 Address</span>
                                    <span className="courier-card__value">{order.recipientAddress}</span>
                                </div>
                                <div className="courier-card__row">
                                    <span className="courier-card__label">💳 Payment</span>
                                    <span className="courier-card__value">
                                        {order.productPaymentStatus === 'Paid'
                                            ? '✓ Paid'
                                            : `⚠ Collect${order.whoPaysForCompanyService === 'Recipient' ? ' + courier fee' : ''}`}
                                    </span>
                                </div>
                                {order.deliveryDateFrom && order.deliveryDateTo && (
                                    <div className="courier-card__row">
                                        <span className="courier-card__label">📅 Window</span>
                                        <span className="courier-card__value">
                                            {new Date(order.deliveryDateFrom).toLocaleDateString()}
                                            {' – '}
                                            {new Date(order.deliveryDateTo).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                                {order.description && <div className="courier-card__note">{order.description}</div>}
                            </div>
                            <div className="courier-card__footer">
                                {order.status === 'CourierAssignedToDeliver' && (
                                    <SwipeButton
                                        label="📥 Swipe — Confirm Receipt"
                                        variant="primary"
                                        disabled={isBusy}
                                        onSwipe={() => onAct(order.id, () => markOrderReceived(token, order.id), 'Marked as received.')}
                                    />
                                )}
                                {order.status === 'CourierRecievedOrderToDeliver' && (
                                    <SwipeButton
                                        label="✅ Swipe — Mark as Delivered"
                                        variant="success"
                                        disabled={isBusy}
                                        onSwipe={() => onAct(order.id, () => markOrderDelivered(token, order.id), 'Order delivered to recipient.')}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
