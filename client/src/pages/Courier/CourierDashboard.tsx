import { useCallback, useEffect, useRef, useState } from 'react';
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
import { NewOrderAlert } from './components/NewOrderAlert';
import type { NewOrderAlertItem } from './components/NewOrderAlert';
import { primeAudio, playChime, vibrate } from './components/newOrderSound';
import { lookupGeocode, haversineKm } from './components/useGeoSort';
import { enablePush, pushSupported, isIos, isStandalone } from '../../realtime/pushNotifications';

// Persist the last-seen order ids per courier (localStorage) so the heads-up can also fire on
// reopen for orders assigned while the app was fully closed — the in-memory diff only covers an
// already-open session. Keyed per courier so a shared device doesn't leak one courier's ids.
function loadSeenIds(key: string): Set<string> | null {
    try { const raw = localStorage.getItem(key); return raw ? new Set(JSON.parse(raw) as string[]) : null; }
    catch { return null; }
}
function saveSeenIds(key: string, ids: Set<string>): void {
    try { localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* storage unavailable — ignore */ }
}

// Mobile bottom-tab label: split the leading emoji (icon) from the word so the
// icon sits on its own line above a single-line, non-wrapping label. Keeps all
// four tabs aligned even when the localized word is long (e.g. Georgian "ფინანსები").
function MobileTabLabel({ raw }: { raw: string }) {
    const sp = raw.indexOf(' ');
    const icon = sp === -1 ? '' : raw.slice(0, sp);
    const text = sp === -1 ? raw : raw.slice(sp + 1);
    return (
        <>
            {icon && <span className="mobile-tab__icon" aria-hidden="true">{icon}</span>}
            <span className="mobile-tab__label">{text}</span>
        </>
    );
}

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

    // ── New-order heads-up ───────────────────────────────────────────────────────
    // Only assignment adds an order to a courier's list (their own actions only remove/
    // change status), so a newly-appearing id ⇒ a freshly-assigned order. We diff each
    // refetch against the last-seen ids (initialised silently on first load, so no alert
    // fires for the orders already there) and surface anything new with a popup + chime +
    // vibration (+ an OS notification when the app is backgrounded and permitted).
    const [newOrders, setNewOrders] = useState<NewOrderAlertItem[]>([]);
    const seenPickupIdsRef = useRef<Set<string> | null>(null);
    const seenDeliveryIdsRef = useRef<Set<string> | null>(null);
    const courierPosRef = useRef<{ lat: number; lng: number } | null>(null);
    // Persisted-baseline keys, scoped per courier so reopen surfaces orders assigned while closed.
    const seenKeyPickup = `courier_seen_pickup_v1_${user?.username ?? 'anon'}`;
    const seenKeyDeliv  = `courier_seen_delivery_v1_${user?.username ?? 'anon'}`;

    const fireAlert = useCallback((items: NewOrderAlertItem[]) => {
        if (items.length === 0) return;
        setNewOrders(prev => {
            const ids = new Set(prev.map(i => i.id));
            return [...prev, ...items.filter(i => !ids.has(i.id))];
        });
        playChime();
        vibrate();
        // OS notification only when the app is backgrounded-but-alive (foreground shows the popup).
        try {
            if (typeof document !== 'undefined' && document.hidden
                && 'Notification' in window && Notification.permission === 'granted') {
                const title = items.length > 1 ? t.cdNewOrdersTitle(items.length) : t.cdNewOrderTitle;
                const f = items[0];
                const body = [f.store, [f.city, f.district].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
                new Notification(title, { body, tag: 'dilo-new-order' });
            }
        } catch { /* notifications unavailable — ignore */ }
    }, [t]);

    const distTo = (c: [number, number] | null): number | null => {
        const p = courierPosRef.current;
        return p && c ? haversineKm(p.lat, p.lng, c[0], c[1]) : null;
    };

    const detectNewPickups = useCallback((data: AdminGroupOrder[]) => {
        const ids = new Set(data.map(go => go.id));
        // Baseline = this session's snapshot, else the persisted set from last time the app was
        // open (so orders assigned while closed surface on reopen). null = first-ever use → silent.
        const baseline = seenPickupIdsRef.current ?? loadSeenIds(seenKeyPickup);
        const added = baseline ? data.filter(go => !baseline.has(go.id)) : [];
        seenPickupIdsRef.current = ids;
        saveSeenIds(seenKeyPickup, ids);
        if (added.length === 0) return;
        fireAlert(added.map(go => ({
            id: go.id, kind: 'pickup' as const,
            store: go.senderBusinessName || `${go.senderFirstName} ${go.senderLastName}`.trim(),
            address: go.pickUpAddress, city: go.pickUpCity, district: go.pickUpDistrict,
            type: go.orders[0]?.orderType ?? 'Send',
            distanceKm: distTo(lookupGeocode(go.pickUpAddress, go.pickUpDistrict, go.pickUpCity)),
        })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fireAlert]);

    const detectNewDeliveries = useCallback((data: CourierOrder[]) => {
        const ids = new Set(data.map(o => o.id));
        const baseline = seenDeliveryIdsRef.current ?? loadSeenIds(seenKeyDeliv);
        const added = baseline ? data.filter(o => !baseline.has(o.id)) : [];
        seenDeliveryIdsRef.current = ids;
        saveSeenIds(seenKeyDeliv, ids);
        if (added.length === 0) return;
        fireAlert(added.map(o => ({
            id: o.id, kind: 'delivery' as const,
            store: o.senderBusinessName ?? '',
            address: o.recipientAddress, city: o.recipientCity, district: o.recipientDistrict,
            type: o.orderType,
            distanceKm: distTo(o.latitude != null && o.longitude != null
                ? [o.latitude, o.longitude]
                : lookupGeocode(o.recipientAddress, o.recipientDistrict, o.recipientCity)),
        })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fireAlert]);

    const loadPickups = useCallback(async (silent = false) => {
        if (!token) return;
        if (!silent) { setPickupLoading(true); setPickupError(null); }
        try { const data = await fetchMyPickups(token); detectNewPickups(data); setPickups(data); }
        catch { if (!silent) setPickupError(t.cdPickupsLoading); }
        finally { if (!silent) setPickupLoading(false); }
    }, [token, t.cdPickupsLoading, detectNewPickups]);

    const loadDeliveries = useCallback(async (silent = false) => {
        if (!token) return;
        if (!silent) { setDeliveriesLoading(true); setDeliveriesError(null); }
        try { const data = await fetchMyDeliveries(token); detectNewDeliveries(data); setDeliveries(data); }
        catch { if (!silent) setDeliveriesError(t.cdDeliveriesLoading); }
        finally { if (!silent) setDeliveriesLoading(false); }
    }, [token, t.cdDeliveriesLoading, detectNewDeliveries]);

    useEffect(() => { loadPickups(); }, [loadPickups]);
    useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

    // ── Push notifications enablement (alerts even when the app is closed) ────────
    const [showPushPrompt, setShowPushPrompt] = useState(false);
    const [showIosInstall, setShowIosInstall] = useState(false);
    useEffect(() => {
        if (!token) return;
        // iOS only allows Web Push from an installed (Home Screen) PWA — nudge them to install.
        if (isIos() && !isStandalone()) { setShowIosInstall(true); return; }
        if (!pushSupported()) return;
        if (Notification.permission === 'granted') { void enablePush(token); }   // keep subscription fresh
        else if (Notification.permission === 'default') { setShowPushPrompt(true); }
        // 'denied' → respect the choice, show nothing.
    }, [token]);

    // Track the courier's position so the heads-up can show how far a new order is.
    useEffect(() => {
        if (!navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(
            pos => { courierPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
            () => { /* denied/unavailable — distance just won't show */ },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // Unlock audio + ask for notification permission on the courier's first tap (browser rules
    // require a user gesture for both). After that the chime and OS notifications can fire.
    useEffect(() => {
        const onFirstTap = () => {
            primeAudio();
            try {
                if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
            } catch { /* ignore */ }
        };
        window.addEventListener('pointerdown', onFirstTap, { once: true });
        return () => window.removeEventListener('pointerdown', onFirstTap);
    }, []);

    // Ask the browser to keep our storage (the saved login) persistent so it isn't evicted
    // under storage pressure or by iOS's inactivity cleanup — keeps couriers logged in.
    useEffect(() => {
        (async () => {
            try {
                if (navigator.storage?.persist && navigator.storage.persisted) {
                    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
                }
            } catch { /* not supported — ignore */ }
        })();
    }, []);

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

    // Apply the same action to several pickups at once (same-status bulk action).
    // Each order is attempted independently so one failure doesn't abort the rest.
    async function actBulk(ids: string[], fn: (id: string) => Promise<void>, msg: string) {
        setBusyId('__bulk__');
        let fail = 0;
        for (const id of ids) { try { await fn(id); } catch { fail++; } }
        showToast(fail === 0 ? msg : t.cdBulkPartial(ids.length - fail, fail));
        loadPickups(true); loadDeliveries(true);
        setBusyId(null);
    }

    const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };
    const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'C';
    const fullName = user ? `${user.firstName} ${user.lastName}` : '';

    const pickupProps = { pickups, loading: pickupLoading, error: pickupError, onRefresh: loadPickups, busyId, token: token!, onAct: act, onBulkAct: actBulk };
    const deliveryProps = { deliveries, loading: deliveriesLoading, error: deliveriesError, busyId, token: token!, onAct: act };

    // "Enable notifications" nudge (or iOS install hint) — rendered in both layouts.
    const pushBanner = (showPushPrompt || showIosInstall) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            background: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)',
            borderRadius: 10, padding: '10px 12px', margin: '0 0 10px', fontSize: '0.85rem', color: 'var(--color-text)' }}>
            <span style={{ flex: 1, minWidth: 180 }}>🔔 {showIosInstall ? t.cdPushIosHint : t.cdPushPrompt}</span>
            {showPushPrompt && (
                <button
                    onClick={async () => {
                        const r = await enablePush(token!);
                        if (r !== 'error') setShowPushPrompt(false);
                        if (r === 'not-configured') showToast(t.cdToastFailed);
                    }}
                    style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {t.cdPushEnable}
                </button>
            )}
            <button onClick={() => { setShowPushPrompt(false); setShowIosInstall(false); }} aria-label={t.cancel}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
        </div>
    ) : null;

    // Heads-up popup for freshly-assigned orders (rendered in both layouts; null when none).
    const newOrderAlert = (
        <NewOrderAlert
            items={newOrders}
            onDismiss={() => setNewOrders([])}
            onView={(kind: 'pickup' | 'delivery') => { setView(kind === 'pickup' ? 'pickups' : 'deliveries'); setNewOrders([]); }}
        />
    );

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
                    {pushBanner}
                    <div className="mobile-tabs">
                        <button className={`mobile-tab${view === 'pickups'     ? ' mobile-tab--active' : ''}`} onClick={() => setView('pickups')}><MobileTabLabel raw={t.cdTabPickups} /></button>
                        <button className={`mobile-tab${view === 'deliveries'  ? ' mobile-tab--active' : ''}`} onClick={() => setView('deliveries')}><MobileTabLabel raw={t.cdTabDeliveries} /></button>
                        <button className={`mobile-tab${view === 'history'     ? ' mobile-tab--active' : ''}`} onClick={() => setView('history')}><MobileTabLabel raw={t.cdTabHistory} /></button>
                        <button className={`mobile-tab${view === 'settlements' ? ' mobile-tab--active' : ''}`} onClick={() => setView('settlements')}><MobileTabLabel raw={t.cdTabPay} /></button>
                    </div>
                    {view === 'pickups'     && <PickupsPanel    {...pickupProps} />}
                    {view === 'deliveries'  && <DeliveriesPanel {...deliveryProps} />}
                    {view === 'history'     && <CourierHistoryPage />}
                    {view === 'settlements' && <CourierSettlementsPage />}
                </main>
                {newOrderAlert}
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
                {pushBanner}
                {view === 'pickups'     && <PickupsPanel    {...pickupProps} />}
                {view === 'deliveries'  && <DeliveriesPanel {...deliveryProps} />}
                {view === 'history'     && <CourierHistoryPage />}
                {view === 'settlements' && <CourierSettlementsPage />}
            </main>
            {newOrderAlert}
        </div>
    );
}
