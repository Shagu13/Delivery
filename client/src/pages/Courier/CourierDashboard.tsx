import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchMyPickups } from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import { fetchMyDeliveries } from '../../api/orders';
import type { CourierOrder } from '../../api/orders';
import '../../styles/dashboard.css';
import { PickupsPanel } from './components/PickupsPanel';
import { DeliveriesPanel } from './components/DeliveriesPanel';
import { CourierHistoryPage } from './CourierHistoryPage';
import { CourierSettlementsPage } from './CourierSettlementsPage';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { useRefreshOnResume } from '../../hooks/useRefreshOnResume';

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

// ── Root component ─────────────────────────────────────────────────────────────
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

    const loadPickups = useCallback(async (silent = false) => {
        if (!token) return;
        if (!silent) { setPickupLoading(true); setPickupError(null); }
        try { setPickups(await fetchMyPickups(token)); }
        catch { if (!silent) setPickupError(t.cdPickupsLoading); }
        finally { if (!silent) setPickupLoading(false); }
    }, [token, t.cdPickupsLoading]);

    const loadDeliveries = useCallback(async (silent = false) => {
        if (!token) return;
        if (!silent) { setDeliveriesLoading(true); setDeliveriesError(null); }
        try { setDeliveries(await fetchMyDeliveries(token)); }
        catch { if (!silent) setDeliveriesError(t.cdDeliveriesLoading); }
        finally { if (!silent) setDeliveriesLoading(false); }
    }, [token, t.cdDeliveriesLoading]);

    useEffect(() => { loadPickups(); }, [loadPickups]);
    useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

    // Live refresh: when the admin assigns (or reassigns) a pickup/delivery to this
    // courier, refetch both lists silently so the new order appears without a refresh.
    useOrdersChangedSignal(token ?? null, 'courierOrdersChanged', () => {
        void loadPickups(true);
        void loadDeliveries(true);
    });

    // Refresh on resume: when the courier returns to the app after backgrounding it
    // (warm resume — SignalR pings fired while away are not replayed), silently
    // refetch both lists so they're never looking at stale data.
    useRefreshOnResume(() => {
        void loadPickups(true);
        void loadDeliveries(true);
    });

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

    // ── Mobile ─────────────────────────────────────────────────────────────────
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
                        <LanguageToggle />
                        <div className="mobile-topbar__avatar">{initials}</div>
                        <span className="mobile-topbar__name">{fullName}</span>
                        <button className="mobile-topbar__signout" onClick={handleSignOut} title={t.signOut}>⎋</button>
                    </div>
                </header>
                <main className="mobile-content">
                    {toast && <div className="dashboard__toast">{toast}</div>}
                    <div className="mobile-tabs">
                        <button className={`mobile-tab${view === 'pickups'     ? ' mobile-tab--active' : ''}`} onClick={() => setView('pickups')}>{t.cdTabPickups}</button>
                        <button className={`mobile-tab${view === 'deliveries'  ? ' mobile-tab--active' : ''}`} onClick={() => setView('deliveries')}>{t.cdTabDeliveries}</button>
                        <button className={`mobile-tab${view === 'history'     ? ' mobile-tab--active' : ''}`} onClick={() => setView('history')}>{t.cdTabHistory}</button>
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

    // ── Desktop ────────────────────────────────────────────────────────────────
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
                        <button className={`sidebar__link${view === 'pickups'     ? ' sidebar__link--active' : ''}`} onClick={() => setView('pickups')}>{t.cdTabPickups}</button>
                        <button className={`sidebar__link${view === 'deliveries'  ? ' sidebar__link--active' : ''}`} onClick={() => setView('deliveries')}>{t.cdTabDeliveries}</button>
                        <button className={`sidebar__link${view === 'history'     ? ' sidebar__link--active' : ''}`} onClick={() => setView('history')}>{t.cdTabHistory}</button>
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
                    <div style={{ marginBottom: 8 }}><LanguageToggle /></div>
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
