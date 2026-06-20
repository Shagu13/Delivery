import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { CreateCourierModal } from './CreateCourierModal';
import { EditCourierModal } from './EditCourierModal';
import type { CreateCourierResponse, Courier, CourierOrder, CourierDayDelivery, CourierDayPickup } from '../../api/couriers';
import { fetchGroupOrders,
    fetchPickupDay, fetchCustomerUnattached, attachOrdersToGroup, mergeGroupOrders, moveOrderToGroup } from '../../api/adminGroupOrders';
import type { AdminGroupOrder, AdminOrder, PickupDayCustomer } from '../../api/adminGroupOrders';
import { EditOrderModal, type CustomerServicePricing } from './EditOrderModal';
import type { AdminOrderItem } from './AdminOrdersPage';
import { fetchCouriers, fetchAssignedForRange, fetchAssignedPickupsForRange, setCourierActiveStatus } from '../../api/couriers';
import { AdminGroupOrderActions, AdminOrderRowActions } from './AdminGroupOrderActions';
import { recipientDisplayName } from '../../utils/recipientName';
import AdminCustomersPage from './AdminCustomersPage';
import AdminCitiesPage from './AdminCitiesPage';
import AdminOrdersPage from './AdminOrdersPage';
import { useLanguage } from '../../contexts/useLanguage';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { getStatusMeta } from '../../utils/statusMeta';
import '../../styles/dashboard.css';
import { fetchSmsBalance } from '../../api/sms';
import AdminWeightPriceTiersPage from './AdminWeightPriceTiersPage';
import AdminPartnersPage from './AdminPartnersPage';
import AdminHistoryPage from './AdminHistoryPage';
import AdminFinancePage from './AdminFinancePage';
import AdminReturnExchangePage from './AdminReturnExchangePage';
import { useAdminPendingCounts } from '../../realtime/useAdminPendingCounts';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { isCompletedGroupOrder } from '../../utils/groupOrderUtils';
import { georgianToday, georgianDateKeyOf } from '../../utils/georgianTime';

// Terminal order statuses — these orders are hidden from the active Group Orders page
// and shown only in the History page.
const ACTIVE_ORDER_STATUSES_ONLY = new Set([
  'DeliveredToRecipient',
  'CancelledBySender',
  'CancelledByAdmin',
  'OrderNotAccepted',
  'ReturnedToSender',
  'ExchangeCompleted',
]);


// ── Pick-up phase ordering ───────────────────────────────────────────────────
// Within a customer card, packages sort by their parent batch's pickup phase:
//   0 = still needs pickup, 1 = assigned / on the way to warehouse, 2 = at warehouse & beyond.
// Ties break by creation time (oldest first) — the first order of the day on top.
const PICKUP_BUCKET: Record<string, number> = {
  Pending:                      0,
  AcceptedGroupOrder:           0,
  CourierAssignedToPickUp:      1,
  CourierOnTheWayToPickUp:      1,
  CourierDeliveringToWarehouse: 1,
};
const pickupBucket = (groupStatus: string) => PICKUP_BUCKET[groupStatus] ?? 2;

// Batches a pickup courier can still be (re)assigned to — mirrors the backend's
// AssignCourierToGroupOrder precondition (Accepted, or re-assign while awaiting pickup).
// Pending is included because the assign flow accepts the batch first.
const PICKUP_ELIGIBLE = new Set(['Pending', 'AcceptedGroupOrder', 'CourierAssignedToPickUp']);

// Batches still open enough to be merged — mirrors the backend GroupOrderAppendPolicy
// (anything before the courier marks the batch picked up).
const MERGEABLE_STATUSES = new Set(['Pending', 'AcceptedGroupOrder', 'CourierAssignedToPickUp', 'CourierOnTheWayToPickUp']);

// Unite a customer's same-day batches: same customer + same physical pickup address.
// Falls back to the sender phone when there's no linked customer (legacy/guest batches).
const customerGroupKey = (go: AdminGroupOrder) =>
  `${go.customerId ?? `p:${go.senderPhone}`}|${go.pickUpCity}|${go.pickUpDistrict}|${go.pickUpAddress}`;

type AdminView = 'overview' | 'orders' | 'packages' | 'couriers' | 'customers' | 'cities' | 'weightTiers' | 'partners' | 'history' | 'returnExchange' | 'finance';

const ADMIN_VIEWS: readonly AdminView[] = ['overview', 'orders', 'packages', 'couriers', 'customers', 'cities', 'weightTiers', 'partners', 'history', 'returnExchange', 'finance'];

export function AdminDashboard() {
  const { user, signOut, token } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tabParam    = searchParams.get('tab') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const viewParam   = searchParams.get('view') ?? '';

  // Seed the active view from the URL so a page refresh stays on the current page.
  const [sidebarView, setSidebarView] = useState<AdminView>(
    (ADMIN_VIEWS as readonly string[]).includes(viewParam) ? (viewParam as AdminView) : 'overview'
  );
  const activeView: AdminView = tabParam === 'orders' ? 'orders' : sidebarView;

  const goTo = (view: AdminView) => {
    // Persist the view in the URL (replace, no history spam) so refresh restores it.
    navigate(view === 'overview' ? '/admin' : `/admin?view=${view}`, { replace: true });
    setSidebarView(view);
  };

  const [showCreateCourier, setShowCreateCourier] = useState(false);
  const [editCourier, setEditCourier] = useState<Courier | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Live return/exchange badge count (SignalR) — shared with the staff nav.
  const { returnExchange: returnExchangeCount } = useAdminPendingCounts(token ?? null, true);

  useEffect(() => {
    if (!token) return;
    fetchCouriers(token).then(setCouriers).catch(() => {});
  }, [token]);

  const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };

  const handleCourierCreated = (courier: CreateCourierResponse) => {
    if (token) fetchCouriers(token).then(setCouriers).catch(() => {});
    setShowCreateCourier(false);
    setToast(`Courier "${courier.fullName}" created successfully.`);
    setTimeout(() => setToast(null), 4000);
    goTo('couriers');
  };

  const handleCourierUpdated = (courierId: string, newUsername: string, newPhone: string, newIdNumber: string) => {
    setCouriers(prev => prev.map(c =>
      c.courierId === courierId
        ? { ...c, username: newUsername, phoneNumber: newPhone, idNumber: newIdNumber }
        : c
    ));
    setEditCourier(null);
  };

  const handleCourierActiveChanged = (courierId: string, isActive: boolean) => {
    setCouriers(prev => prev.map(c => c.courierId === courierId ? { ...c, isDeleted: !isActive, dateDeleted: isActive ? null : new Date().toISOString() } : c));
  };

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'A';

  return (
    <div className="dashboard">
      <aside className={`sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar__logo">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sidebar__logo-text">{t.appName}</span>
        </div>
        <button
          className="sidebar__collapse-btn"
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            {sidebarCollapsed
              ? <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              : <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            }
          </svg>
        </button>
        <span className="sidebar__role-badge">Admin</span>
        <div className="sidebar__divider" />
        <p className="sidebar__section-label">{t.sidebarManagement}</p>
        <nav className="sidebar__nav">
          <button className={`sidebar__link ${activeView === 'overview' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('overview')} title={t.sidebarOverview}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarOverview}</span>
          </button>
          <button className={`sidebar__link ${activeView === 'orders' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('orders')} title={t.navPickUp}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 5.5h7M4.5 8h5M4.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.navPickUp}</span>
          </button>
          <button className={`sidebar__link ${activeView === 'packages' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('packages')} title={t.navDelivery}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M1 8h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.navDelivery}</span>
          </button>
          <button className={`sidebar__link ${activeView === 'couriers' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('couriers')} title={t.sidebarCouriers}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarCouriers}</span>
            {couriers.length > 0 && <span className="sidebar__badge sidebar__badge--count">{couriers.length}</span>}
          </button>
          <button className={`sidebar__link ${activeView === 'customers' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('customers')} title={t.sidebarCustomers}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1 14c0-2.5 2-4 4.5-4M8 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarCustomers}</span>
          </button>
          <button className={`sidebar__link ${activeView === 'cities' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('cities')} title={t.sidebarCities}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="7" width="14" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M8 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarCities}</span>
          </button>
          <button
            className={`sidebar__link ${activeView === 'weightTiers' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('weightTiers')}
            title={t.sidebarWeightTiers}
          >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h12M5 5l-3 3 3 3M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sidebar__link-text">{t.sidebarWeightTiers}</span>
          </button>
          <button
            className={`sidebar__link ${activeView === 'partners' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('partners')}
            title="Partner API"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 9.5L3.8 12.2a2.2 2.2 0 0 1-3.1-3.1l2.7-2.7M9.5 6.5l2.7-2.7a2.2 2.2 0 0 1 3.1 3.1l-2.7 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M6 10l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">Partner API</span>
          </button>
          <button
            className={`sidebar__link ${activeView === 'history' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('history')}
            title={t.sidebarHistory}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="sidebar__link-text">{t.sidebarHistory}</span>
          </button>
          <button
            className={`sidebar__link ${activeView === 'returnExchange' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('returnExchange')}
            title={t.navReturnExchange}
            style={{ position: 'relative' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 1 0 6-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="sidebar__link-text">{t.navReturnExchange}</span>
            {returnExchangeCount > 0 && (
              <span className="sidebar__badge" style={{ background: '#ef4444', color: '#fff', marginLeft: 'auto' }}>
                {returnExchangeCount > 99 ? '99+' : returnExchangeCount}
              </span>
            )}
          </button>
          <button
            className={`sidebar__link ${activeView === 'finance' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('finance')}
            title={t.navFinance}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 4.5v7M9.8 6c0-.8-.8-1.3-1.8-1.3S6.2 5.2 6.2 6s.8 1.1 1.8 1.4S9.9 8.2 9.9 9s-.8 1.3-1.9 1.3S6.1 9.8 6.1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.navFinance}</span>
          </button>
        </nav>
        <div className="sidebar__footer">
          <LanguageToggle className="sidebar__lang-toggle" />
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initials}</div>
            <div className="sidebar__user-info sidebar__link-text">
              <div className="sidebar__user-name">{user?.firstName} {user?.lastName}</div>
              <div className="sidebar__user-handle">@{user?.username}</div>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleSignOut} title={t.signOut}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sidebar__link-text">{t.signOut}</span>
          </button>
        </div>
      </aside>

      <div className="dashboard__body">
        <div className="dashboard__topbar">
          <span className="dashboard__topbar-title">
            {activeView === 'overview'  && t.topbarOverview}
            {activeView === 'orders'    && t.navPickUp}
            {activeView === 'packages'  && t.navDelivery}
            {activeView === 'couriers'  && t.topbarCouriers}
            {activeView === 'customers' && t.topbarCustomers}
            {activeView === 'cities' && t.topbarCities}
            {activeView === 'weightTiers' && t.topbarWeightTiers}
            {activeView === 'partners' && 'Partner API'}
            {activeView === 'history' && t.topbarHistory}
            {activeView === 'returnExchange' && t.navReturnExchange}
            {activeView === 'finance' && t.navFinance}
          </span>
          {activeView === 'couriers' && (
            <button className="btn-primary" onClick={() => setShowCreateCourier(true)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t.addCourier}
            </button>
          )}
        </div>
        <main className="dashboard__content">
          {activeView === 'overview'  && <AdminOverview token={token ?? ''} />}
          {activeView === 'orders'    && <AdminOrders key={statusParam} initialStatus={statusParam} />}
          {activeView === 'packages'  && <AdminOrdersPage token={token ?? ''} />}
          {activeView === 'couriers'  && <AdminCouriers couriers={couriers} token={token ?? ''} onAdd={() => setShowCreateCourier(true)} onEdit={setEditCourier} onActiveChanged={handleCourierActiveChanged} />}
          {activeView === 'customers' && <AdminCustomersPage token={token ?? ''} />}
                  {activeView === 'cities' && <AdminCitiesPage token={token ?? ''} />}
                  {activeView === 'weightTiers' && token && (
                      <AdminWeightPriceTiersPage token={token} />
                  )}
          {activeView === 'partners' && token && <AdminPartnersPage token={token} />}
          {activeView === 'history' && <AdminHistoryPage token={token ?? ''} />}
          {activeView === 'finance' && <AdminFinancePage token={token ?? ''} />}
          {activeView === 'returnExchange' && token && (
            <AdminReturnExchangePage
              token={token}
              couriers={couriers}
              onBack={() => goTo('overview')}
            />
          )}
        </main>
      </div>

      <CreateCourierModal
        key={showCreateCourier ? 'open' : 'closed'}
        open={showCreateCourier}
        onClose={() => setShowCreateCourier(false)}
        onCreated={handleCourierCreated}
      />

      <EditCourierModal
        key={editCourier?.courierId ?? 'none'}
        open={editCourier !== null}
        courier={editCourier}
        token={token ?? ''}
        onClose={() => setEditCourier(null)}
        onUpdated={(id, username, phone, idNumber) => { handleCourierUpdated(id, username, phone, idNumber); }}
      />

      {toast && (
        <div className="toast" role="status">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {toast}
        </div>
      )}

      <style>{`
        .go-status-bar { border-bottom: 1px solid var(--color-border); background: var(--color-bg); gap: 6px; padding: 10px 20px; flex-wrap: wrap; }
        .go-status-pill { background: none; border: 1px solid var(--color-border); border-radius: 100px; color: var(--color-text-subtle); font-size: 0.75rem; font-weight: 600; padding: 4px 12px; cursor: pointer; transition: all var(--transition); white-space: nowrap; }
        .go-status-pill:hover:not(.go-status-pill--active) { background: var(--color-bg-3); color: var(--color-text); }
        .go-status-pill--active { background: var(--color-accent-dim); border-color: rgba(196,127,23,0.35); color: var(--color-accent); }
        .sidebar__badge { margin-left: auto; background: var(--color-accent-dim); color: var(--color-accent); border: 1px solid rgba(196,127,23,0.25); border-radius: 100px; font-size: 0.65rem; font-weight: 700; padding: 1px 7px; min-width: 20px; text-align: center; }
        /* District multi-picker */
        .dmp-root { position: relative; }
        .dmp-trigger { display: inline-flex; align-items: center; gap: 6px; background: var(--color-bg-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 500; padding: 7px 10px; cursor: pointer; transition: all var(--transition); min-width: 130px; white-space: nowrap; }
        .dmp-trigger:hover:not(.dmp-trigger--disabled) { border-color: var(--color-text-subtle); color: var(--color-text); }
        .dmp-trigger--active { background: var(--color-accent-dim); border-color: rgba(196,127,23,0.4); color: var(--color-accent); }
        .dmp-trigger--disabled { opacity: 0.5; cursor: not-allowed; }
        .dmp-label { flex: 1; text-align: left; }
        .dmp-chevron { flex-shrink: 0; }
        .dmp-clear { display: flex; align-items: center; padding: 1px; cursor: pointer; opacity: 0.6; }
        .dmp-clear:hover { opacity: 1; }
        .dmp-dropdown { position: absolute; top: calc(100% + 5px); left: 0; z-index: 50; min-width: 200px; background: var(--color-bg-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 8px 28px rgba(0,0,0,0.16); animation: expand-in 0.12s ease both; }
        .dmp-dropdown-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--color-border); }
        .dmp-dropdown-title { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-subtle); flex: 1; }
        .dmp-select-all { background: none; border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-text-subtle); font-size: 0.7rem; font-weight: 600; padding: 2px 7px; cursor: pointer; transition: all var(--transition); }
        .dmp-select-all:hover { background: var(--color-bg-3); color: var(--color-text); }
        .dmp-list { display: flex; flex-direction: column; padding: 6px; max-height: 220px; overflow-y: auto; gap: 2px; }
        .dmp-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: background var(--transition); }
        .dmp-item:hover { background: var(--color-bg-3); }
        .dmp-item--checked { background: var(--color-accent-dim); }
        .dmp-checkbox { width: 14px; height: 14px; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0; }
        .dmp-item-label { flex: 1; font-size: 0.82rem; color: var(--color-text); }
        .dmp-item-check { color: var(--color-accent); flex-shrink: 0; }
        /* Sidebar link text (hidden when collapsed) */
        .sidebar__link-text { transition: opacity 0.15s, width 0.2s; }
        .sidebar__lang-toggle { margin-bottom: 10px; width: 100%; justify-content: center; }
        .courier-table { width: 100%; border-collapse: collapse; }
        .courier-table th { text-align: left; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-subtle); padding: 12px 16px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); }
        .courier-table td { padding: 13px 16px; font-size: 0.875rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); vertical-align: middle; }
        .courier-table tr:last-child td { border-bottom: none; }
        .courier-table tbody tr { transition: background var(--transition); }
        .courier-table tbody tr:hover { background: var(--color-bg-3); }
        .courier-name { font-weight: 600; }
        .courier-username { font-size: 0.78rem; color: var(--color-text-subtle); margin-top: 1px; }
        .courier-id-badge { font-family: 'Courier New', monospace; font-size: 0.75rem; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 2px 8px; color: var(--color-text-muted); display: inline-block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
        .courier-time { font-size: 0.78rem; color: var(--color-text-subtle); }
        .toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 9px; background: var(--color-text); color: var(--color-bg); border-radius: var(--radius-md); padding: 12px 20px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2); animation: toast-in 0.25s ease both; white-space: nowrap; }
        .toast--error { background: #ef4444 !important; color: #fff !important; }
        @keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .go-toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 20px; flex-wrap: wrap; }
        .go-toolbar--search { border-bottom: 1px solid var(--color-border); }
        .go-toolbar--filters { background: var(--color-bg-3); border-bottom: 1px solid var(--color-border); gap: 12px; flex-wrap: wrap; }
        .go-filter-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--color-text-subtle); white-space: nowrap; margin-right: 4px; }
        .go-filter-chain { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }
        .go-filter-step { display: flex; flex-direction: column; gap: 3px; }
        .go-step-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-subtle); padding-left: 2px; }
        .go-chain-arrow { color: var(--color-text-subtle); flex-shrink: 0; margin-top: 14px; }
        .go-seg { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; background: var(--color-bg); }
        .go-seg__btn { display: flex; align-items: center; gap: 5px; background: none; border: none; color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 500; padding: 7px 13px; cursor: pointer; transition: background var(--transition), color var(--transition); white-space: nowrap; }
        .go-seg__btn:not(:last-child) { border-right: 1px solid var(--color-border); }
        .go-seg__btn:hover:not(.go-seg__btn--active) { background: var(--color-bg-3); color: var(--color-text); }
        .go-seg__btn--active { background: var(--color-accent-dim); color: var(--color-accent); font-weight: 600; }
        .go-select-wrap { position: relative; display: flex; align-items: center; }
        .go-select-icon { position: absolute; left: 10px; color: var(--color-text-subtle); pointer-events: none; flex-shrink: 0; }
        .go-select-chevron { position: absolute; right: 9px; color: var(--color-text-subtle); pointer-events: none; }
        .go-select { appearance: none; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.825rem; padding: 8px 30px 8px 30px; cursor: pointer; min-width: 140px; transition: border-color var(--transition); outline: none; }
        .go-select:focus { border-color: var(--color-accent); }
        .go-select:disabled { opacity: 0.45; cursor: not-allowed; }
        .go-clear-btn { display: flex; align-items: center; gap: 5px; background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.78rem; padding: 7px 11px; cursor: pointer; transition: color var(--transition), border-color var(--transition); white-space: nowrap; }
        .go-clear-btn:hover { color: var(--color-text); border-color: var(--color-text-subtle); }
        .go-search { display: flex; align-items: center; gap: 8px; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0 12px; flex: 1; min-width: 220px; max-width: 420px; transition: border-color var(--transition); }
        .go-search:focus-within { border-color: var(--color-accent); }
        .go-search input { background: none; border: none; outline: none; color: var(--color-text); font-size: 0.875rem; padding: 9px 0; width: 100%; }
        .go-search input::placeholder { color: var(--color-text-subtle); }
        .go-search svg { color: var(--color-text-subtle); flex-shrink: 0; }
        .go-search-clear { background: none; border: none; cursor: pointer; color: var(--color-text-subtle); padding: 0; display: flex; align-items: center; flex-shrink: 0; }
        .go-search-clear:hover { color: var(--color-text); }
        .go-count { font-size: 0.78rem; color: var(--color-text-subtle); margin-left: auto; white-space: nowrap; }
        .go-list { display: flex; flex-direction: column; }
        .go-row { border-bottom: 1px solid var(--color-border); }
        .go-row:last-child { border-bottom: none; }
        .go-row-header { display: flex; align-items: center; gap: 14px; padding: 14px 20px; cursor: pointer; transition: background var(--transition); user-select: none; }
        .go-row-header:hover { background: var(--color-bg-3); }
        .go-chevron { color: var(--color-text-subtle); flex-shrink: 0; transition: transform 0.18s ease; }
        .go-chevron--open { transform: rotate(90deg); }

        /* Customer/sender details laid out as fixed, labeled columns so each field
           (store, phone, pickup location, status, packages, date) always sits in the
           same place. The grid scrolls horizontally on its own when the row is too
           narrow, keeping the chevron and action buttons fixed and always reachable. */
        .go-details-scroll { flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
        .go-details {
          display: grid;
          grid-template-columns:
            minmax(150px, 1.6fr)
            minmax(110px, 0.9fr)
            minmax(180px, 2fr)
            minmax(96px, auto)
            minmax(60px, auto)
            minmax(84px, auto);
          align-items: start;
          gap: 6px 22px;
          min-width: 660px;
        }
        .go-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
        .go-cell--center { justify-content: center; }
        .go-cell__label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--color-text-subtle); opacity: 0.85; }
        .go-cell__value { font-size: 0.82rem; color: var(--color-text); font-weight: 600; overflow-wrap: anywhere; }
        .go-cell__value--strong { font-weight: 700; }
        .go-cell__value--mono { font-family: 'Courier New', monospace; font-weight: 500; font-size: 0.78rem; }
        .go-cell__sub { font-size: 0.74rem; color: var(--color-text-subtle); overflow-wrap: anywhere; }
        .go-cell__sub--muted { opacity: 0.85; }

        /* Legacy meta classes — still used by the history page accordion. */
        .go-sender { flex: 1 1 220px; min-width: 180px; }
        .go-sender__biz { font-weight: 600; font-size: 0.9rem; color: var(--color-text); overflow-wrap: anywhere; }
        .go-sender__name { font-size: 0.775rem; color: var(--color-text-subtle); margin-top: 1px; }
        .go-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
        .go-meta__phone { font-size: 0.78rem; color: var(--color-text-subtle); font-family: 'Courier New', monospace; }
        .go-meta__city { font-size: 0.78rem; color: var(--color-text-subtle); }
        .go-meta__pkgs { font-size: 0.75rem; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: 100px; padding: 2px 9px; color: var(--color-text-muted); white-space: nowrap; display: inline-block; width: fit-content; }
        .go-meta__date { font-size: 0.75rem; color: var(--color-text-subtle); white-space: nowrap; }
        .status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border-radius: 100px; padding: 3px 10px; white-space: nowrap; }
        .status-badge::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .status-badge--pending     { background: rgba(160,120,0,0.12);  color: #c4870f; }
        .status-badge--accepted    { background: rgba(59,130,246,0.12);  color: #3b82f6; }
        .status-badge--assigned    { background: rgba(139,92,246,0.12);  color: #8b5cf6; }
        .status-badge--onway       { background: rgba(139,92,246,0.12);  color: #8b5cf6; }
        .status-badge--delivering  { background: rgba(249,115,22,0.12);  color: #f97316; }
        .status-badge--warehouse   { background: rgba(16,185,129,0.12);  color: #10b981; }
        .status-badge--delivered   { background: rgba(16,185,129,0.12);  color: #10b981; }
        .status-badge--cancelled   { background: rgba(239,68,68,0.12);   color: #ef4444; }
        .status-badge--declined    { background: rgba(239,68,68,0.12);   color: #ef4444; }
        .go-orders { background: var(--color-bg-2, var(--color-bg-3)); border-top: 1px solid var(--color-border); overflow-x: auto; animation: expand-in 0.15s ease both; }
        @keyframes expand-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .go-orders-table { width: 100%; border-collapse: collapse; min-width: 760px; }
        .go-orders-table th { text-align: left; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-subtle); padding: 10px 16px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); white-space: nowrap; }
        .go-orders-table td { padding: 11px 16px; font-size: 0.825rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); vertical-align: middle; }
        .go-orders-table tr:last-child td { border-bottom: none; }
        .go-orders-table tbody tr:hover { background: rgba(255,255,255,0.02); }
        .tn-badge { font-family: 'Courier New', monospace; font-size: 0.75rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 2px 7px; color: var(--color-text-muted); display: inline-block; white-space: nowrap; }
        .go-note { padding: 10px 20px 14px; font-size: 0.8rem; color: var(--color-text-subtle); font-style: italic; border-top: 1px solid var(--color-border); }
        .go-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px 20px; color: var(--color-text-subtle); font-size: 0.875rem; }
        .go-error { padding: 24px 20px; color: #ef4444; font-size: 0.875rem; text-align: center; }
        .go-spinner { width: 18px; height: 18px; border: 2px solid var(--color-border); border-top-color: var(--color-accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .go-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0; margin-left: auto; flex-shrink: 0; }
        .go-action-btn { border: none; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; padding: 6px 14px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
        .go-action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .go-action-btn--accept    { background: #10b981; color: #fff; }
        .go-action-btn--decline   { background: #ef4444; color: #fff; }
        .go-action-btn--assign    { background: var(--color-accent); color: #fff; }
        .go-action-btn--warehouse { background: #3b82f6; color: #fff; }
        .go-action-btn--city      { background: #8b5cf6; color: #fff; }
        .go-action-btn--ghost     { background: var(--color-bg-3); border: 1px solid var(--color-border); color: var(--color-text); }
        .go-action-hint { font-size: 0.72rem; color: var(--color-text-subtle); font-style: italic; }
        .go-courier-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .go-select--inline { min-width: 200px; padding: 6px 28px 6px 10px; font-size: 0.8rem; }
        .action-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 9px; background: var(--color-text); color: var(--color-bg); border-radius: var(--radius-md); padding: 12px 20px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2); animation: toast-in 0.25s ease both; white-space: nowrap; }
        .action-toast--err { background: #ef4444; color: #fff; }

        /* Pick-Up day navigator */
        .pickup-daynav { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); }
        .pickup-daynav__arrow { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); cursor: pointer; transition: all var(--transition); }
        .pickup-daynav__arrow:hover { background: var(--color-bg-3); border-color: var(--color-text-subtle); }
        .pickup-daynav__label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.92rem; font-weight: 700; color: var(--color-text); }
        .pickup-daynav__today { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-accent); background: var(--color-accent-dim); border-radius: 100px; padding: 2px 8px; }
        .pickup-daynav__jump { margin-left: 4px; background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.76rem; font-weight: 600; padding: 6px 12px; cursor: pointer; transition: all var(--transition); }
        .pickup-daynav__jump:hover { background: var(--color-bg-3); color: var(--color-text); }
        .pickup-modes { margin-left: auto; display: inline-flex; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
        .pickup-mode { background: none; border: none; color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: all var(--transition); white-space: nowrap; }
        .pickup-mode:not(:last-child) { border-right: 1px solid var(--color-border); }
        .pickup-mode:hover:not(.pickup-mode--active) { background: var(--color-bg-3); color: var(--color-text); }
        .pickup-mode--active { background: var(--color-accent-dim); color: var(--color-accent); }
        .pickup-controls { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); flex-wrap: wrap; }
        .pickup-ungrouped-bar { margin-bottom: 10px; }

        /* Pick-Up per-customer summary */
        .pickup-summary { padding: 12px 20px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); }
        .pickup-summary__head { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-subtle); margin-bottom: 8px; }
        .pickup-summary__empty { font-size: 0.82rem; color: var(--color-text-subtle); }
        .pickup-summary__list { display: flex; flex-direction: column; gap: 6px; }
        .pickup-cust { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px 12px; }
        .pickup-cust__name { font-weight: 700; font-size: 0.86rem; color: var(--color-text); flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pickup-cust__stat { font-size: 0.78rem; color: var(--color-text-subtle); white-space: nowrap; }
        .pickup-cust__stat b { color: var(--color-text); }
        .pickup-cust__stat--warn b { color: var(--color-accent); }
        .pickup-cust__group { background: var(--color-accent); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 0.76rem; font-weight: 700; padding: 6px 14px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
        .pickup-cust__group:disabled { opacity: 0.4; cursor: not-allowed; }
        .pickup-cust__merge { background: #8b5cf6; color: #fff; border: none; border-radius: var(--radius-sm); font-size: 0.76rem; font-weight: 700; padding: 6px 14px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
        .pickup-cust__merge:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Grouping modal */
        .pickup-modal__overlay { position: fixed; inset: 0; background: rgba(26,23,20,0.55); backdrop-filter: blur(4px); z-index: 220; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .pickup-modal { width: min(720px, 100%); max-height: 86vh; display: flex; flex-direction: column; background: var(--color-bg-2); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.28); overflow: hidden; }
        .pickup-modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
        .pickup-modal__title { margin: 0; font-family: var(--font-display); font-size: 1.02rem; font-weight: 800; color: var(--color-text); }
        .pickup-modal__subtitle { margin: 4px 0 0; font-size: 0.8rem; color: var(--color-text-subtle); }
        .pickup-modal__close { background: none; border: none; color: var(--color-text-subtle); cursor: pointer; padding: 4px; border-radius: var(--radius-sm); }
        .pickup-modal__close:hover { color: var(--color-text); background: var(--color-bg-3); }
        .pickup-modal__body { padding: 12px 20px; overflow-y: auto; }
        .pickup-modal__target { display: flex; align-items: center; gap: 10px; padding: 4px 0 12px; font-size: 0.82rem; font-weight: 600; color: var(--color-text); flex-wrap: wrap; }
        .pickup-modal__target select { min-width: 200px; }
        .pickup-modal__selectall { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 600; color: var(--color-text); padding: 6px 0 10px; cursor: pointer; }
        .pickup-modal__selcount { margin-left: auto; font-size: 0.76rem; font-weight: 600; color: var(--color-accent); }
        .pickup-modal__error { margin-top: 12px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius-sm); color: #ef4444; font-size: 0.82rem; padding: 10px 14px; }
        .pickup-modal__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--color-border); }
      `}</style>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Local YYYY-MM-DD for the pickup-day query param (avoids UTC date drift).
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const meta = getStatusMeta(status, lang);
  return (
    <span
      className={`status-badge status-badge--${STATUS_CLASS_MAP[status] ?? 'pending'}`}
      title={meta.description}
    >
      {meta.short}
    </span>
  );
}

const STATUS_CLASS_MAP: Record<string, string> = {
  Pending:                         'pending',
  AcceptedGroupOrder:              'accepted',
  AcceptedOrder:                   'accepted',
  CourierAssignedToPickUp:         'assigned',
  CourierOnTheWayToPickUp:         'onway',
  CourierDeliveringToWarehouse:    'delivering',
  DeliveredToWarehouse:            'warehouse',
  AdminAcceptedOrderInWareHouse:   'warehouse',
  OrderIsOnItsWayToRecipientsCity: 'onway',
  CourierAssignedToDeliver:        'assigned',
  CourierDeliveringTheOrderToRecipient: 'delivering',
  OrderIsBeingDeliveredToRecipient:'delivering',
  DeliveredToRecipient:            'delivered',
  CancelledBySender:               'cancelled',
  CancelledByAdmin:                'cancelled',
  OrderNotAccepted:                'declined',
};

// ── Sub-views ─────────────────────────────────────────────────────────────────

function AdminOverview({ token }: { token: string }) {
    const { t } = useLanguage();
    const [groupOrders, setGroupOrders] = useState<AdminGroupOrder[]>([]);
    const [couriers, setCouriersLocal] = useState<Courier[]>([]);
    const [smsBalance, setSmsBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        Promise.all([
            fetchGroupOrders(token).catch(() => [] as AdminGroupOrder[]),
            fetchCouriers(token).catch(() => [] as Courier[]),
            fetchSmsBalance(token).catch(() => null as number | null),
        ]).then(([go, co, sms]) => {
            if (cancelled) return;
            setGroupOrders(go);
            setCouriersLocal(co);
            setSmsBalance(sms);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [token]);

    const totalOrders = groupOrders.reduce((sum, go) => sum + go.orders.length, 0);
    const pendingPickup = groupOrders.filter(go =>
        go.status === 'Pending' || go.status === 'AcceptedGroupOrder' ||
        go.status === 'CourierAssignedToPickUp' || go.status === 'CourierOnTheWayToPickUp'
    ).length;
    const inTransit = groupOrders.reduce((sum, go) =>
        sum + go.orders.filter(o =>
            o.status === 'OrderIsOnItsWayToRecipientsCity' ||
            o.status === 'CourierAssignedToDeliver' ||
            o.status === 'CourierDeliveringTheOrderToRecipient'
        ).length, 0);
    const activeCouriers = couriers.filter(c => !c.isDeleted).length;

    const recent = [...groupOrders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8);

    const smsBalanceDisplay = loading
        ? '…'
        : smsBalance === null
            ? '—'
            : smsBalance.toLocaleString();

    // Low balance warning threshold
    const smsLow = smsBalance !== null && smsBalance < 50;

    const stats = [
        { label: t.overviewTotalOrders ?? 'Total Orders', value: loading ? '…' : String(totalOrders), sub: t.overviewAllTime ?? 'All time' },
        { label: t.overviewPendingPickup ?? 'Pending Pickup', value: loading ? '…' : String(pendingPickup), sub: t.overviewAwaitingCourier ?? 'Awaiting courier' },
        { label: t.overviewInTransit ?? 'In Transit', value: loading ? '…' : String(inTransit), sub: t.overviewActiveDeliveries ?? 'Active deliveries' },
        { label: t.overviewActiveCouriers ?? 'Active Couriers', value: loading ? '…' : String(activeCouriers), sub: t.overviewAvailableNow ?? 'Available now' },
        {
            label: 'SMS Credits',
            value: smsBalanceDisplay,
            sub: smsLow ? '⚠️ Low balance' : 'UBill balance',
            low: smsLow,
        },
    ];

    return (
        <>
            <div className="stat-grid">
                {stats.map((s, i) => (
                    <div
                        className="stat-card"
                        key={s.label}
                        style={{ animationDelay: `${i * 60}ms` }}
                    >
                        <div className="stat-card__label">{s.label}</div>
                        <div
                            className="stat-card__value"
                            style={s.low ? { color: '#ef4444' } : undefined}
                        >
                            {s.value}
                        </div>
                        <div
                            className="stat-card__sub"
                            style={s.low ? { color: '#ef4444' } : undefined}
                        >
                            {s.sub}
                        </div>
                    </div>
                ))}
            </div>
            <div className="content-card">
                <div className="content-card__header">
                    <span className="content-card__title">{t.overviewRecentGroupOrders ?? 'Recent Group Orders'}</span>
                </div>
                {loading ? (
                    <div className="go-loading">
                        <div className="go-spinner" />
                    </div>
                ) : recent.length === 0 ? (
                    <div className="empty-state">
                        <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
                            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M12 16h16M12 22h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <span className="empty-state__text">{t.goEmptyState ?? 'Orders will appear here'}</span>
                    </div>
                ) : (
                    <table className="courier-table">
                        <thead>
                            <tr>
                                <th>{t.goColBusiness ?? 'Business'}</th>
                                <th>{t.goColSender ?? 'Sender'}</th>
                                <th>{t.goColCity ?? 'City'}</th>
                                <th>{t.goColPackages ?? 'Packages'}</th>
                                <th>{t.goColStatus ?? 'Status'}</th>
                                <th>{t.goColDate ?? 'Date'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.map(go => (
                                <tr key={go.id}>
                                    <td><span className="courier-name">{go.senderBusinessName}</span></td>
                                    <td><span className="courier-username">{go.senderFirstName} {go.senderLastName}</span></td>
                                    <td>{go.pickUpCity}</td>
                                    <td>{go.numberOfPackages}</td>
                                    <td><StatusBadge status={go.status} /></td>
                                    <td><span className="courier-time">{formatDate(go.createdAt)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}


// ── Statuses that live on individual orders (not on the GroupOrder itself)
const ORDER_LEVEL_STATUSES = new Set([
  'OrderIsOnItsWayToRecipientsCity',
  'CourierAssignedToDeliver',
  'CourierDeliveringTheOrderToRecipient',
  'DeliveredToRecipient',
  'CancelledByAdmin',
]);

// Active-only view: exclude group orders that are fully completed
// (same logic as AdminHistoryPage.isCompletedGroupOrder)

const STATUS_PILLS = [
  { value: '',                                label: 'pillAll' },
  { value: 'Pending',                         label: 'pillPending' },
  { value: 'AcceptedGroupOrder',              label: 'pillAccepted' },
  { value: 'CourierAssignedToPickUp',         label: 'pillCourierPickup' },
  { value: 'CourierOnTheWayToPickUp',         label: 'pillOnTheWay' },
  { value: 'CourierDeliveringToWarehouse',    label: 'pillToWarehouse' },
  { value: 'DeliveredToWarehouse',            label: 'pillAtWarehouse' },
  { value: 'AdminAcceptedOrderInWareHouse',   label: 'pillWarehouseAccepted' },
  { value: 'OrderIsOnItsWayToRecipientsCity', label: 'pillSentToCity' },
  { value: 'CourierAssignedToDeliver',        label: 'pillCourierDelivery' },
  { value: 'CourierDeliveringTheOrderToRecipient', label: 'pillCourierReceived' },
] as const;

// ── Multi-district checkbox dropdown ─────────────────────────────────────────

interface DistrictMultiPickerProps {
  available: string[];
  selected: string[];
  onChange: (districts: string[]) => void;
  districtGeoMap: Record<string, string | undefined>;
  locDistrict: (en: string, geo?: string | null) => string;
  disabled?: boolean;
}

function DistrictMultiPicker({
  available, selected, onChange, districtGeoMap, locDistrict, disabled
}: DistrictMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (d: string) => {
    onChange(selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d]);
  };

  const label = selected.length === 0
    ? 'All Districts'
    : selected.length === 1
      ? locDistrict(selected[0], districtGeoMap[selected[0]])
      : `${selected.length} districts`;

  return (
    <div className="dmp-root" ref={ref}>
      <button
        type="button"
        className={`dmp-trigger${selected.length > 0 ? ' dmp-trigger--active' : ''}${disabled ? ' dmp-trigger--disabled' : ''}`}
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        <span className="dmp-label">{label}</span>
        {selected.length > 0 && (
          <span
            className="dmp-clear"
            role="button"
            tabIndex={0}
            title="Clear districts"
            onClick={e => { e.stopPropagation(); onChange([]); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); }}}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="dmp-chevron">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && !disabled && (
        <div className="dmp-dropdown">
          <div className="dmp-dropdown-header">
            <span className="dmp-dropdown-title">Select districts</span>
            {selected.length > 0 && (
              <button className="dmp-select-all" type="button" onClick={() => onChange([])}>Clear all</button>
            )}
            {selected.length < available.length && (
              <button className="dmp-select-all" type="button" onClick={() => onChange([...available])}>All</button>
            )}
          </div>
          <div className="dmp-list">
            {available.map(d => {
              const checked = selected.includes(d);
              return (
                <label key={d} className={`dmp-item${checked ? ' dmp-item--checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(d)}
                    className="dmp-checkbox"
                  />
                  <span className="dmp-item-label">{locDistrict(d, districtGeoMap[d])}</span>
                  {checked && (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="dmp-item-check">
                      <path d="M2.5 7l3.5 3.5 5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminOrders({ initialStatus = '' }: { initialStatus?: string }) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const [groupOrders, setGroupOrders]   = useState<AdminGroupOrder[]>([]);
  const [couriers,    setCouriers]      = useState<Courier[]>([]);
  const [loading,     setLoading]       = useState(true);
  const [error,       setError]         = useState<string | null>(null);
  const [search,      setSearch]        = useState('');
  const [filterParty,    setFilterParty]    = useState<'sender' | 'recipient'>('sender');
  const [filterCity,     setFilterCity]     = useState('');
  const [filterDistricts,setFilterDistricts] = useState<string[]>([]);
  const [filterStatus,   setFilterStatus]   = useState(initialStatus);
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [actionToast,    setActionToast]    = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  // Order being edited from a group order's package row, with its customer's pricing.
  const [editing, setEditing] = useState<{ item: AdminOrderItem; pricing: CustomerServicePricing | null } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pick-Up day navigation + grouping ──────────────────────────────────────
  // The page always shows one day (today by default) and steps with the arrows.
  const [selectedDate,     setSelectedDate]     = useState<Date>(() => georgianToday());
  const [daySummary,       setDaySummary]       = useState<PickupDayCustomer[]>([]);
  const [groupingCustomer, setGroupingCustomer] = useState<PickupDayCustomer | null>(null);
  const shiftDay = (delta: number) => setSelectedDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + delta); d.setHours(0, 0, 0, 0); return d; });
  const isToday = toDateKey(selectedDate) === toDateKey(georgianToday());
  const [mergingCustomer, setMergingCustomer] = useState<{ name: string; batches: AdminGroupOrder[] } | null>(null);
  // Grouped (batches) vs Non-grouped (customers with un-grouped orders) view.
  const [pickupMode,      setPickupMode]      = useState<'grouped' | 'ungrouped'>('grouped');
  const [customerFilter,  setCustomerFilter]  = useState<string>('');   // '' = all customers
  const [ungroupedSearch, setUngroupedSearch] = useState('');

  // Map a group order's package + its parent into the shape EditOrderModal expects.
  // Sender fields come from the group order; fields the modal doesn't read are stubbed.
  const openEditOrder = (o: AdminOrder, go: AdminGroupOrder) => {
    const item: AdminOrderItem = {
      id: o.id,
      trackingNumber: o.trackingNumber,
      senderBusinessName: go.senderBusinessName,
      senderFirstName: go.senderFirstName,
      senderLastName: go.senderLastName,
      senderPhone: go.senderPhone,
      alternativeSenderPhone: go.alternativeSenderPhone ?? null,
      recipientName: o.recipientName,
      recipientPhone: o.recipientPhone,
      recipientCity: o.recipientCity,
      recipientCityGeo: o.recipientCityGeo,
      recipientDistrict: o.recipientDistrict,
      recipientDistrictGeo: o.recipientDistrictGeo,
      recipientAddress: o.recipientAddress,
      description: o.description,
      isFragile: o.isFragile,
      orderType: o.orderType,
      status: o.status,
      productPaymentStatus: o.productPaymentStatus,
      whoPaysForCompanyService: o.whoPaysForCompanyService,
      companyServicePrice: o.companyServicePrice,
      isCompanyServicePriceIncluded: o.isCompanyServicePriceIncluded,
      courierSalary: o.courierSalary,
      companyRevenue: o.companyRevenue,
      amountToCollectForPackage: o.amountToCollectForPackage,
      returnPickupCity: o.returnPickupCity ?? null,
      returnPickupDistrict: o.returnPickupDistrict ?? null,
      returnPickupAddress: o.returnPickupAddress ?? null,
      courierId: o.courierId,
      courierFullName: go.courierFullName,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      postponeReason: null,
    };
    setEditing({
      item,
      pricing: {
        capital:  go.companyServiceCapitalPrice,
        city:     go.companyServiceCityPrice,
        district: go.companyServiceDistrictPrice,
      },
    });
  };

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setActionToast({ msg, type });
    setTimeout(() => setActionToast(null), 4000);
  };

  const load = useCallback(async (term: string) => {
    try {
      const data = await fetchGroupOrders(token ?? '', term || undefined);
      setGroupOrders(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.goLoadingOrders);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadSummary = useCallback(async () => {
    try { setDaySummary(await fetchPickupDay(token ?? '', toDateKey(selectedDate))); }
    catch { setDaySummary([]); }
  }, [token, selectedDate]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  useEffect(() => {
    void (async () => { setLoading(true); await load(''); })();
  }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => { setLoading(true); await load(search); })();
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, load]);

  // Live refresh: when any order is placed/changed, refetch silently (keep current
  // search term, no spinner) so new customer orders appear without a manual refresh.
  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; });
  useOrdersChangedSignal(token ?? null, 'adminOrdersChanged', () => { void load(searchRef.current); void loadSummary(); });

  useEffect(() => {
    fetchCouriers(token ?? '').then(setCouriers).catch(() => {});
  }, [token]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handlePartyChange = (party: 'sender' | 'recipient') => { setFilterParty(party); setFilterCity(''); setFilterDistricts([]); };
  const handleCityChange  = (city: string) => { setFilterCity(city); setFilterDistricts([]); };

  const availableCities = useMemo(() => {
    if (filterParty === 'sender') return [...new Set(groupOrders.map(go => go.pickUpCity))].sort();
    return [...new Set(groupOrders.flatMap(go => go.orders.map(o => o.recipientCity)))].sort();
  }, [groupOrders, filterParty]);

  // Maps English city name → Geo name using data already in groupOrders
  const cityGeoMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    groupOrders.forEach(go => {
      if (go.pickUpCityGeo) map[go.pickUpCity] = go.pickUpCityGeo;
      go.orders.forEach(o => { if (o.recipientCityGeo) map[o.recipientCity] = o.recipientCityGeo; });
    });
    return map;
  }, [groupOrders]);

  const districtGeoMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    groupOrders.forEach(go => {
      if (go.pickUpDistrictGeo) map[go.pickUpDistrict] = go.pickUpDistrictGeo;
      go.orders.forEach(o => { if (o.recipientDistrictGeo) map[o.recipientDistrict] = o.recipientDistrictGeo; });
    });
    return map;
  }, [groupOrders]);

  const availableDistricts = useMemo(() => {
    if (!filterCity) return [];
    if (filterParty === 'sender') return [...new Set(groupOrders.filter(go => go.pickUpCity === filterCity).map(go => go.pickUpDistrict))].sort();
    return [...new Set(groupOrders.flatMap(go => go.orders).filter(o => o.recipientCity === filterCity).map(o => o.recipientDistrict))].sort();
  }, [groupOrders, filterParty, filterCity]);

  const visibleOrders = useMemo(() => {
    return groupOrders.filter(go => {
      // Always hide fully completed group orders — they live in History.
      if (isCompletedGroupOrder(go)) return false;

      if (filterStatus) {
        if (ORDER_LEVEL_STATUSES.has(filterStatus)) {
          if (!go.orders.some(o => o.status === filterStatus)) return false;
        } else {
          if (go.status !== filterStatus) return false;
        }
      }
      if (!filterCity && filterDistricts.length === 0) return true;
      if (filterParty === 'sender') {
        if (filterCity     && go.pickUpCity     !== filterCity)                                     return false;
        if (filterDistricts.length > 0 && !filterDistricts.includes(go.pickUpDistrict)) return false;
        return true;
      }
      return go.orders.some(o => {
        if (filterCity                && o.recipientCity     !== filterCity)     return false;
        if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
        return true;
      });
    });
  }, [groupOrders, filterStatus, filterCity, filterDistricts, filterParty]);

  // Only the selected day's batches (Pick-Up page is single-day, by Georgian created date).
  const dayKey = toDateKey(selectedDate);
  const dayOrders = useMemo(
    () => visibleOrders.filter(go => georgianDateKeyOf(go.createdAt) === dayKey),
    [visibleOrders, dayKey],
  );

  // The still-open batches each customer has that day — drives the Merge chooser.
  const mergeableByCustomer = useMemo(() => {
    const m = new Map<string, AdminGroupOrder[]>();
    for (const go of groupOrders) {
      if (!go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== dayKey) continue;
      if (!MERGEABLE_STATUSES.has(go.status)) continue;
      const arr = m.get(go.customerId);
      if (arr) arr.push(go); else m.set(go.customerId, [go]);
    }
    // Earliest first, so the chooser defaults the target to the first batch.
    for (const arr of m.values())
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return m;
  }, [groupOrders, dayKey]);

  // Customers that have batches on the selected day (for the Grouped-view dropdown).
  const groupedCustomers = useMemo(() => {
    const m = new Map<string, string>();
    for (const go of dayOrders) if (go.customerId) m.set(go.customerId, go.senderBusinessName);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [dayOrders]);

  // The batches shown in the Grouped list, narrowed to one customer when chosen.
  const listOrders = useMemo(
    () => (customerFilter ? dayOrders.filter(go => go.customerId === customerFilter) : dayOrders),
    [dayOrders, customerFilter],
  );

  // Non-grouped view = customers whose day isn't already one batch: they still have
  // standalone (un-grouped) orders and/or more than one open batch to consolidate.
  const ungroupedCustomers = useMemo(() => {
    const q = ungroupedSearch.trim().toLowerCase();
    return daySummary.filter(c => {
      const batchCount = mergeableByCustomer.get(c.customerId)?.length ?? 0;
      const needsAttention = c.unattachedOrders > 0 || batchCount > 1;
      return needsAttention && (!q || c.businessName.toLowerCase().includes(q));
    });
  }, [daySummary, ungroupedSearch, mergeableByCustomer]);

  const hasLocationFilter = filterCity || filterDistricts.length > 0;
  const hasFilters        = search || hasLocationFilter || filterStatus;
  const clearAll          = () => { setSearch(''); setFilterCity(''); setFilterDistricts([]); setFilterStatus(''); };

  // Returns only the orders that match the active recipient city/district filter
  // AND are not in a terminal status (delivered/cancelled orders shown in History only).
  const visibleOrdersFor = useCallback((go: AdminGroupOrder) => {
    const orders = go.orders.filter(o => !ACTIVE_ORDER_STATUSES_ONLY.has(o.status));
    if (filterParty !== 'recipient' || (!filterCity && filterDistricts.length === 0)) return orders;
    return orders.filter(o => {
      if (filterCity                && o.recipientCity     !== filterCity)     return false;
      if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
      return true;
    });
  }, [filterParty, filterCity, filterDistricts]);

  // ── Date section grouping ─────────────────────────────────────────────────
  const groupByDate = (orders: AdminGroupOrder[]) => {
    const today     = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const sections: { label: string; items: AdminGroupOrder[] }[] = [];
    const buckets: Record<string, AdminGroupOrder[]> = {};
    for (const go of orders) {
      const d = new Date(go.createdAt); d.setHours(0,0,0,0);
      const key = d.getTime() === today.getTime()     ? '__today__'
                : d.getTime() === yesterday.getTime() ? '__yesterday__'
                : go.createdAt.slice(0, 10);
      (buckets[key] ??= []).push(go);
    }
    const orderedKeys = Object.keys(buckets).sort((a, b) => {
      const ta = a === '__today__' ? today.getTime() : a === '__yesterday__' ? yesterday.getTime() : new Date(a).getTime();
      const tb = b === '__today__' ? today.getTime() : b === '__yesterday__' ? yesterday.getTime() : new Date(b).getTime();
      return tb - ta;
    });
    for (const key of orderedKeys) {
      const label = key === '__today__'     ? 'Today'
                  : key === '__yesterday__' ? 'Yesterday'
                  : new Date(key).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      sections.push({ label, items: buckets[key] });
    }
    return sections;
  };

  // ── Customer uniting (within a day) ───────────────────────────────────────
  // Unite all of one customer's same-day batches into a single card. Packages are
  // flattened across the batches and ordered by pickup phase (needs-pickup first,
  // warehouse last), oldest-first within a phase.
  const buildCustomerGroups = useCallback((items: AdminGroupOrder[]) => {
    const map = new Map<string, AdminGroupOrder[]>();
    for (const go of items) {
      const k = customerGroupKey(go);
      const arr = map.get(k);
      if (arr) arr.push(go); else map.set(k, [go]);
    }
    return [...map.entries()].map(([key, gos]) => {
      const head = gos[0];
      const flat = gos.flatMap(go => visibleOrdersFor(go).map(o => ({ o, go })));
      flat.sort((a, b) => {
        const ba = pickupBucket(a.go.status), bb = pickupBucket(b.go.status);
        if (ba !== bb) return ba - bb;
        return new Date(a.o.createdAt).getTime() - new Date(b.o.createdAt).getTime();
      });
      // First row of each batch carries the batch-level lifecycle buttons (decline /
      // accept-in-warehouse), so they don't repeat for multi-package batches.
      const seen = new Set<string>();
      const rows = flat.map(r => {
        const firstOfBatch = !seen.has(r.go.id);
        seen.add(r.go.id);
        return { ...r, firstOfBatch };
      });
      const counts = { needs: 0, assigned: 0, warehouse: 0 };
      for (const r of flat) {
        const b = pickupBucket(r.go.status);
        if (b === 0) counts.needs++; else if (b === 1) counts.assigned++; else counts.warehouse++;
      }
      const eligibleGoIds = [...new Set(flat.filter(r => PICKUP_ELIGIBLE.has(r.go.status)).map(r => r.go.id))];
      const earliest = flat.length ? Math.min(...flat.map(r => new Date(r.o.createdAt).getTime())) : new Date(head.createdAt).getTime();
      return { key, head, rows, counts, eligibleGoIds, earliest };
    })
    .filter(c => c.rows.length > 0)
    .sort((a, b) => a.earliest - b.earliest);
  }, [visibleOrdersFor]);

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>
      {/* Day navigator — always one day, today by default */}
      <div className="pickup-daynav">
        <button className="pickup-daynav__arrow" onClick={() => shiftDay(-1)} aria-label={t.pickupPrevDay} title={t.pickupPrevDay}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="pickup-daynav__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>{selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {isToday && <span className="pickup-daynav__today">{t.pickupToday}</span>}
        </div>
        <button className="pickup-daynav__arrow" onClick={() => shiftDay(1)} aria-label={t.pickupNextDay} title={t.pickupNextDay}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {!isToday && (
          <button className="pickup-daynav__jump" onClick={() => setSelectedDate(georgianToday())}>
            {t.pickupToday}
          </button>
        )}
        <div className="pickup-modes">
          <button
            className={`pickup-mode ${pickupMode === 'grouped' ? 'pickup-mode--active' : ''}`}
            onClick={() => setPickupMode('grouped')}
          >
            {t.pickupTabGrouped}
          </button>
          <button
            className={`pickup-mode ${pickupMode === 'ungrouped' ? 'pickup-mode--active' : ''}`}
            onClick={() => setPickupMode('ungrouped')}
          >
            {t.pickupTabUngrouped}
          </button>
        </div>
      </div>

      {/* ── Non-grouped view: customers still holding un-grouped orders ── */}
      {pickupMode === 'ungrouped' && (
        <div className="pickup-summary">
          <div className="pickup-ungrouped-bar">
            <div className="go-search" style={{ maxWidth: 340 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder={t.pickupSearchCustomer}
                value={ungroupedSearch}
                onChange={e => setUngroupedSearch(e.target.value)}
                autoComplete="off"
              />
              {ungroupedSearch && (
                <button onClick={() => setUngroupedSearch('')} className="go-search-clear" aria-label="Clear search">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              )}
            </div>
          </div>
          {ungroupedCustomers.length === 0 ? (
            <div className="pickup-summary__empty">{t.pickupNoUngrouped}</div>
          ) : (
            <div className="pickup-summary__list">
              {ungroupedCustomers.map(c => {
                const batchCount = mergeableByCustomer.get(c.customerId)?.length ?? 0;
                return (
                <div className="pickup-cust" key={c.customerId}>
                  <span className="pickup-cust__name" title={c.businessName}>{c.businessName}</span>
                  {c.unattachedOrders > 0 && (
                    <span className="pickup-cust__stat pickup-cust__stat--warn">{t.pickupUngrouped}: <b>{c.unattachedOrders}</b></span>
                  )}
                  {batchCount > 1 && (
                    <span className="pickup-cust__stat pickup-cust__stat--warn">{t.pickupBatches}: <b>{batchCount}</b></span>
                  )}
                  <span className="pickup-cust__stat">{t.pickupOrdersPlaced}: <b>{c.ordersPlaced}</b></span>
                  {c.unattachedOrders > 0 && (
                    <button className="pickup-cust__group" onClick={() => setGroupingCustomer(c)}>
                      {t.pickupGroupOrdersBtn}
                    </button>
                  )}
                  {batchCount >= 2 && (
                    <button
                      className="pickup-cust__merge"
                      onClick={() => setMergingCustomer({ name: c.businessName, batches: mergeableByCustomer.get(c.customerId) ?? [] })}
                    >
                      {t.pickupMergeBtn}
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Grouped view: customer filter + (conditional) merge ── */}
      {pickupMode === 'grouped' && (
        <div className="pickup-controls">
          <div className="go-select-wrap">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <select className="go-select" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
              <option value="">{t.pickupAllCustomers}</option>
              {groupedCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
      )}

      {pickupMode === 'grouped' && (<>
      {/* Search + Location filter (combined row) */}
      <div className="go-toolbar go-toolbar--search" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        {/* Search */}
        <div className="go-search" style={{ flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder={t.goSearchPh}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button onClick={() => setSearch('')} className="go-search-clear" aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: 'var(--color-border)', flexShrink: 0, alignSelf: 'center' }} />

        {/* Location filter inline */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <div className="go-filter-step">
            <span className="go-step-label">{t.goParty}</span>
            <div className="go-seg">
              <button className={`go-seg__btn ${filterParty === 'sender' ? 'go-seg__btn--active' : ''}`}
                onClick={() => handlePartyChange('sender')}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3 2.686-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                {t.goSender}
              </button>
              <button className={`go-seg__btn ${filterParty === 'recipient' ? 'go-seg__btn--active' : ''}`}
                onClick={() => handlePartyChange('recipient')}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                {t.goRecipient}
              </button>
            </div>
          </div>
          <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginBottom: 6 }}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div className="go-filter-step">
            <span className="go-step-label">{t.goCity}</span>
            <div className="go-select-wrap">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6c0-2.485-2.015-4.5-4.5-4.5zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" stroke="currentColor" strokeWidth="1.2"/></svg>
              <select className="go-select" value={filterCity} onChange={e => handleCityChange(e.target.value)} disabled={loading || availableCities.length === 0}>
                <option value="">{t.goAllCities}</option>
                {availableCities.map(c => <option key={c} value={c}>{locCity(c, cityGeoMap[c])}</option>)}
              </select>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          {filterCity && (
            <>
              <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginBottom: 6 }}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div className="go-filter-step">
                <span className="go-step-label">{t.goDistrict}</span>
                <DistrictMultiPicker
                  available={availableDistricts}
                  selected={filterDistricts}
                  onChange={setFilterDistricts}
                  districtGeoMap={districtGeoMap}
                  locDistrict={locDistrict}
                  disabled={availableDistricts.length === 0}
                />
              </div>
            </>
          )}
          {hasLocationFilter && (
            <button className="go-clear-btn" onClick={clearAll} style={{ alignSelf: 'flex-end' }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              {t.goClear}
            </button>
          )}
        </div>

        {/* Count */}
        {!loading && !error && (
          <span className="go-count" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
            {filterParty === 'recipient' && hasLocationFilter
              ? (() => {
                  const n = visibleOrders.reduce((sum, go) => sum + visibleOrdersFor(go).length, 0);
                  return `${n} order${n !== 1 ? 's' : ''}${hasFilters ? ` ${t.goOrdersMatched}` : ''}`;
                })()
              : `${t.goOrderCount(visibleOrders.length, groupOrders.length)}${hasFilters ? ` ${t.goOrdersMatched}` : ''}`
            }
          </span>
        )}
      </div>

      {/* Status pills */}
      <div className="go-toolbar go-status-bar">
        <span className="go-filter-label">{t.goStatus}</span>
        {STATUS_PILLS.map(({ value, label }) => (
          <button
            key={value || 'all'}
            className={`go-status-pill ${filterStatus === value ? 'go-status-pill--active' : ''}`}
            onClick={() => setFilterStatus(value)}
          >
            {t[label]}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && <div className="go-loading"><div className="go-spinner" />{t.goLoadingOrders}</div>}
      {!loading && error && <div className="go-error">{error}</div>}
      {!loading && !error && listOrders.length === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{hasFilters ? t.goNoOrdersFilters : t.goNoOrders}</span>
        </div>
      )}

      {/* Group order list — date-sectioned accordion */}
      {!loading && !error && listOrders.length > 0 && (() => {
        // ── Flat view: recipient party + location filter active ──────────────
        const showFlat = filterParty === 'recipient' && hasLocationFilter;

        if (showFlat) {
          const flatOrders = listOrders.flatMap(go =>
            visibleOrdersFor(go).map(o => ({ ...o, _go: go }))
          );
          return (
            <div style={{ overflowX: 'auto' }}>
              <table className="go-orders-table">
                <thead>
                  <tr>
                    <th>{t.goThTracking}</th>
                    <th>{t.goThRecipient}</th>
                    <th>{t.goThPhone}</th>
                    <th>{t.goThCityDistrict}</th>
                    <th>{t.goThAddress}</th>
                    <th>{t.goThDescription}</th>
                    <th>{t.goThStatus}</th>
                    <th>{t.goThCollect}</th>
                    <th>{t.goThPaid}</th>
                    <th>{t.goThActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {flatOrders.map(o => (
                    <tr key={o.id}>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td><div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div></td>
                      <td style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>{o.recipientPhone}</td>
                      <td>
                        <div>{locCity(o.recipientCity, o.recipientCityGeo)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{locDistrict(o.recipientDistrict, o.recipientDistrictGeo)}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{o.recipientAddress}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 160 }}>
                        {o.description ?? <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td><StatusBadge status={o.status} /></td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {o.amountToCollectForPackage != null
                          ? `₾${o.amountToCollectForPackage.toFixed(2)}`
                          : <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td>
                        {o.productPaymentStatus === 'Paid' ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>{t.goPaid}</span>
                        ) : (() => {
                          const courierDue = o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;
                          const sub = o.productPaymentStatus === 'NotPaid' && courierDue ? t.goSubParcelAndFee
                                    : courierDue ? t.goSubFeeOnly : t.goSubParcelOnly;
                          return (
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>{t.goUnpaid}</span>
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#ef4444', opacity: 0.8 }}>{sub}</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <AdminOrderRowActions order={o} storeName={o._go.senderBusinessName} couriers={couriers} token={token ?? ''}
                          onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
                          onRefresh={() => load(search)}
                          onEdit={() => openEditOrder(o, o._go)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // ── Default: date-sectioned accordion ────────────────────────────────
        const sections = groupByDate(listOrders);
        return (
          <div className="go-list">
            {sections.map(({ label, items }) => {
              const customers = buildCustomerGroups(items);
              return (
              <div key={label}>
                {/* Date section header */}
                <div style={{
                  padding: '7px 20px', fontSize: '0.68rem', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--color-text-subtle)',
                  background: 'var(--color-bg-3)',
                  borderBottom: '1px solid var(--color-border)',
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  {label}
                  <span style={{ marginLeft: 4, fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>
                    — {customers.length} customer{customers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {items.map(go => {
                  const expanded = expandedIds.has(go.id);
                  const filteredOrders = visibleOrdersFor(go);
                  // Other open batches of this customer an order could be moved into.
                  const custBatches = go.customerId ? (mergeableByCustomer.get(go.customerId) ?? []) : [];
                  const moveDestinations = custBatches.some(b => b.id === go.id)
                    ? custBatches.filter(b => b.id !== go.id)
                    : [];
                  return (
                    <div className="go-row" key={go.id}>
                      <div className="go-row-header" onClick={() => toggleExpand(go.id)}>
                        <svg className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="go-details-scroll">
                          <div className="go-details">
                            <div className="go-cell">
                              <span className="go-cell__label">{t.goSender}</span>
                              <span className="go-cell__value go-cell__value--strong">{go.senderBusinessName || '—'}</span>
                              <span className="go-cell__sub">{go.senderFirstName} {go.senderLastName}</span>
                            </div>
                            <div className="go-cell">
                              <span className="go-cell__label">{t.goThPhone}</span>
                              <span className="go-cell__value go-cell__value--mono">{go.senderPhone}</span>
                              {go.alternativeSenderPhone && (
                                <span className="go-cell__sub go-cell__value--mono">{go.alternativeSenderPhone}</span>
                              )}
                            </div>
                            <div className="go-cell">
                              <span className="go-cell__label">{t.cgoPickupLocation}</span>
                              <span className="go-cell__value">{locCity(go.pickUpCity, go.pickUpCityGeo)}, {locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}</span>
                              {go.pickUpAddress && <span className="go-cell__sub">{go.pickUpAddress}</span>}
                            </div>
                            <div className="go-cell go-cell--center">
                              <span className="go-cell__label">{t.goColStatus}</span>
                              <StatusBadge status={go.status} />
                            </div>
                            <div className="go-cell go-cell--center">
                              <span className="go-cell__label">{t.goColPackages}</span>
                              <span className="go-meta__pkgs">{t.goPkgs(go.numberOfPackages)}</span>
                            </div>
                            <div className="go-cell go-cell--center">
                              <span className="go-cell__label">{t.goColDate}</span>
                              <span className="go-cell__sub go-cell__sub--muted">{formatDate(go.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <AdminGroupOrderActions
                          groupOrder={go} couriers={couriers} token={token ?? ''}
                          onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
                          onRefresh={() => load(search)}
                        />
                      </div>

                      {expanded && (
                        <div className="go-orders">
                          {filteredOrders.length === 0 ? (
                            <div style={{ padding: '16px 20px', fontSize: '0.825rem', color: 'var(--color-text-subtle)' }}>
                              {t.goNoLocationMatch}
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table className="go-orders-table">
                                <thead>
                                  <tr>
                                    <th>{t.goThTracking}</th>
                                    <th>{t.goThRecipient}</th>
                                    <th>{t.goThPhone}</th>
                                    <th>{t.goThCityDistrict}</th>
                                    <th>{t.goThAddress}</th>
                                    <th>{t.goThDescription}</th>
                                    <th>{t.goThStatus}</th>
                                    <th>{t.goThCollect}</th>
                                    <th>{t.goThPaid}</th>
                                    <th>{t.goThActions}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredOrders.map(o => (
                                    <tr key={o.id}>
                                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                                      <td><div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div></td>
                                      <td style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>{o.recipientPhone}</td>
                                      <td>
                                        <div>{locCity(o.recipientCity, o.recipientCityGeo)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{locDistrict(o.recipientDistrict, o.recipientDistrictGeo)}</div>
                                      </td>
                                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{o.recipientAddress}</td>
                                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 160 }}>
                                        {o.description ?? <span style={{ opacity: 0.4 }}>—</span>}
                                      </td>
                                      <td><StatusBadge status={o.status} /></td>
                                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {o.amountToCollectForPackage != null
                                          ? `₾${o.amountToCollectForPackage.toFixed(2)}`
                                          : <span style={{ opacity: 0.4 }}>—</span>}
                                      </td>
                                      <td>
                                        {o.productPaymentStatus === 'Paid' ? (
                                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>{t.goPaid}</span>
                                        ) : (() => {
                                          const courierDue = o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;
                                          const sub = o.productPaymentStatus === 'NotPaid' && courierDue ? t.goSubParcelAndFee
                                                    : courierDue ? t.goSubFeeOnly : t.goSubParcelOnly;
                                          return (
                                            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>{t.goUnpaid}</span>
                                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#ef4444', opacity: 0.8 }}>{sub}</span>
                                            </span>
                                          );
                                        })()}
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                          <AdminOrderRowActions order={o} storeName={go.senderBusinessName} couriers={couriers} token={token ?? ''}
                                            onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
                                            onRefresh={() => load(search)}
                                            onEdit={() => openEditOrder(o, go)} />
                                          {moveDestinations.length > 0 && (
                                            <MoveOrderControl
                                              orderId={o.id}
                                              destinations={moveDestinations}
                                              token={token ?? ''}
                                              onMoved={() => { void load(search); void loadSummary(); showToast(t.pickupMovedToast); }}
                                              onError={msg => showToast(msg, 'err')}
                                            />
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {go.note && <div className="go-note"><strong>{t.goNote}:</strong> {go.note}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        );
      })()}
      </>)}

      {/* Action toast */}
      {actionToast && (
        <div className={`action-toast ${actionToast.type === 'err' ? 'action-toast--err' : ''}`} role="status">
          {actionToast.msg}
        </div>
      )}

      {/* Edit a single package from a group order */}
      <EditOrderModal
        order={editing?.item ?? null}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(search); }}
        token={token ?? ''}
        couriers={couriers}
        customerPricing={editing?.pricing ?? null}
      />

      {/* Group a customer's unattached orders for the day */}
      {groupingCustomer && (
        <GroupingModal
          customer={groupingCustomer}
          date={selectedDate}
          batches={mergeableByCustomer.get(groupingCustomer.customerId) ?? []}
          token={token ?? ''}
          onClose={() => setGroupingCustomer(null)}
          onGrouped={n => {
            setGroupingCustomer(null);
            showToast(t.pickupGroupedToast(n));
            void load(search);
            void loadSummary();
          }}
        />
      )}

      {/* Merge a customer's same-day batches into one chosen batch */}
      {mergingCustomer && (
        <MergeModal
          customerName={mergingCustomer.name}
          batches={mergingCustomer.batches}
          token={token ?? ''}
          onClose={() => setMergingCustomer(null)}
          onMerged={() => {
            setMergingCustomer(null);
            showToast(t.pickupMergedToast);
            void load(search);
            void loadSummary();
          }}
        />
      )}
    </div>
  );
}

// ── Merge modal ───────────────────────────────────────────────────────────────
// Lists a customer's still-open batches for the day. The admin picks one to keep
// (target) and ticks the others to fold into it.
function MergeModal({
  customerName, batches, token, onClose, onMerged,
}: {
  customerName: string;
  batches: AdminGroupOrder[];
  token: string;
  onClose: () => void;
  onMerged: () => void;
}) {
  const { t, lang } = useLanguage();
  const locCity = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);
  const [targetId,  setTargetId]  = useState(batches[0]?.id ?? '');
  const [sourceIds, setSourceIds] = useState<Set<string>>(() => new Set(batches.slice(1).map(b => b.id)));
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const chooseTarget = (id: string) => {
    setTargetId(id);
    setSourceIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };
  const toggleSource = (id: string) => {
    if (id === targetId) return;
    setSourceIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const selectedSources = [...sourceIds].filter(id => id !== targetId);

  const handleMerge = async () => {
    if (!targetId || selectedSources.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await mergeGroupOrders(token, targetId, selectedSources);
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.pickupMergeError);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="pickup-modal__overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="pickup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pickup-modal__header">
          <div>
            <h3 className="pickup-modal__title">{t.pickupMergeBtn} — {customerName}</h3>
            <p className="pickup-modal__subtitle">{t.pickupMergeModalSubtitle}</p>
          </div>
          <button className="pickup-modal__close" onClick={onClose} disabled={busy} aria-label={t.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="pickup-modal__body">
          <table className="go-orders-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>{t.pickupMergeKeep}</th>
                <th style={{ width: 60, textAlign: 'center' }}>{t.pickupMergeInto}</th>
                <th>{t.goColPackages}</th>
                <th>{t.goColStatus}</th>
                <th>{t.cgoPickupLocation}</th>
                <th>{t.goColDate}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="radio" name="merge-target" checked={targetId === b.id} onChange={() => chooseTarget(b.id)} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" disabled={targetId === b.id} checked={targetId !== b.id && sourceIds.has(b.id)} onChange={() => toggleSource(b.id)} />
                  </td>
                  <td>{t.goPkgs(b.numberOfPackages)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>{locCity(b.pickUpCity, b.pickUpCityGeo)}{b.pickUpAddress ? `, ${b.pickUpAddress}` : ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <div className="pickup-modal__error">{error}</div>}
        </div>

        <div className="pickup-modal__footer">
          <button className="go-action-btn go-action-btn--ghost" onClick={onClose} disabled={busy}>{t.cancel}</button>
          <button className="go-action-btn go-action-btn--city" onClick={handleMerge} disabled={busy || selectedSources.length === 0}>
            {busy ? t.pickupMerging : t.pickupMergeBtn}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Move-order control ──────────────────────────────────────────────────────────
// A compact "Move to…" dropdown shown on an order row to move it into another of the
// customer's open batches.
function MoveOrderControl({
  orderId, destinations, token, onMoved, onError,
}: {
  orderId: string;
  destinations: AdminGroupOrder[];
  token: string;
  onMoved: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const handle = async (targetId: string) => {
    if (!targetId) return;
    setBusy(true);
    try { await moveOrderToGroup(token, orderId, targetId); onMoved(); }
    catch (e) { onError(e instanceof Error ? e.message : t.pickupMoveError); }
    finally { setBusy(false); }
  };

  return (
    <select
      className="go-select go-select--inline"
      style={{ minWidth: 120 }}
      value=""
      disabled={busy}
      onChange={e => void handle(e.target.value)}
      title={t.pickupMoveTo}
    >
      <option value="">{busy ? t.pickupMoving : t.pickupMoveTo}</option>
      {destinations.map(b => (
        <option key={b.id} value={b.id}>
          {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {b.numberOfPackages}
        </option>
      ))}
    </select>
  );
}

// ── Grouping modal ──────────────────────────────────────────────────────────────
// Lists a customer's unattached orders for the chosen day; ticked orders are linked
// to a chosen batch (an existing one or a brand-new batch).
function GroupingModal({
  customer, date, batches, token, onClose, onGrouped,
}: {
  customer: PickupDayCustomer;
  date: Date;
  batches: AdminGroupOrder[];
  token: string;
  onClose: () => void;
  onGrouped: (count: number) => void;
}) {
  const { t, lang } = useLanguage();
  const locCity = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);
  const [orders,   setOrders]   = useState<AdminOrder[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  // '' = create a new batch; otherwise append to the chosen existing batch.
  const [targetBatchId, setTargetBatchId] = useState(batches[0]?.id ?? '');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCustomerUnattached(token, customer.customerId, toDateKey(date))
      .then(data => { if (!cancelled) { setOrders(data); setSelected(new Set(data.map(o => o.id))); } })
      .catch(() => { if (!cancelled) setError(t.pickupGroupError); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, customer.customerId, date, t.pickupGroupError]);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(orders.map(o => o.id)));

  const handleGroup = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await attachOrdersToGroup(token, customer.customerId, toDateKey(date), [...selected], targetBatchId || undefined);
      onGrouped(selected.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.pickupGroupError);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="pickup-modal__overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="pickup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pickup-modal__header">
          <div>
            <h3 className="pickup-modal__title">{t.pickupModalTitle(customer.businessName)}</h3>
            <p className="pickup-modal__subtitle">{t.pickupModalSubtitle}</p>
          </div>
          <button className="pickup-modal__close" onClick={onClose} disabled={busy} aria-label={t.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="pickup-modal__body">
          {loading ? (
            <div className="go-loading"><div className="go-spinner" /></div>
          ) : orders.length === 0 ? (
            <div className="pickup-summary__empty" style={{ padding: 24 }}>{t.pickupModalEmpty}</div>
          ) : (
            <>
              {batches.length > 0 && (
                <label className="pickup-modal__target">
                  <span>{t.pickupGroupTarget}</span>
                  <select className="go-select" value={targetBatchId} onChange={e => setTargetBatchId(e.target.value)}>
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}
                      </option>
                    ))}
                    <option value="">{t.pickupGroupNewBatch}</option>
                  </select>
                </label>
              )}
              <label className="pickup-modal__selectall">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                {t.pickupSelectAll}
                <span className="pickup-modal__selcount">{t.pickupModalSelected(selected.size)}</span>
              </label>
              <table className="go-orders-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th>{t.goThTracking}</th>
                    <th>{t.goThRecipient}</th>
                    <th>{t.goThCityDistrict}</th>
                    <th>{t.goThCollect}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => toggle(o.id)}>
                      <td><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} onClick={e => e.stopPropagation()} /></td>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</td>
                      <td>{locCity(o.recipientCity, o.recipientCityGeo)}, {o.recipientDistrict}</td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {o.amountToCollectForPackage != null ? `₾${o.amountToCollectForPackage.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {error && <div className="pickup-modal__error">{error}</div>}
        </div>

        <div className="pickup-modal__footer">
          <button className="go-action-btn go-action-btn--ghost" onClick={onClose} disabled={busy}>{t.cancel}</button>
          <button className="go-action-btn go-action-btn--assign" onClick={handleGroup} disabled={busy || selected.size === 0}>
            {busy ? t.pickupModalGrouping : t.pickupModalGroup}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Group day-assignments (deliveries or pickups) by courier, dropping any whose
// courier can't be resolved, sorted by who was assigned the most that day.
function groupByCourier<T extends { courierId: string }>(
  items: T[],
  courierById: Map<string, Courier>,
): { courier: Courier; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const arr = map.get(it.courierId);
    if (arr) arr.push(it); else map.set(it.courierId, [it]);
  }
  return [...map.entries()]
    .map(([courierId, list]) => ({ courier: courierById.get(courierId), items: list }))
    .filter((r): r is { courier: Courier; items: T[] } => !!r.courier)
    .sort((a, b) => b.items.length - a.items.length);
}

function AdminCouriers({
  couriers,
  token,
  onAdd,
  onEdit,
  onActiveChanged,
}: {
  couriers: Courier[];
  token: string;
  onAdd: () => void;
  onEdit: (courier: Courier) => void;
  onActiveChanged: (courierId: string, isActive: boolean) => void;
}) {
  const { t } = useLanguage();
  // Single global day for the whole list — defaults to today.
  const [day, setDay] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  // Which sub-view is showing: the day's assigned orders ('today') or the plain roster ('all').
  const [view, setView] = useState<'today' | 'all'>('today');
  // Which leg the day's assignments are shown for: last-mile delivery or warehouse pickup.
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveries, setDeliveries] = useState<CourierDayDelivery[]>([]);
  const [pickups, setPickups] = useState<CourierDayPickup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isToday = isSameDay(day, today);
  const shiftDay = (delta: number) =>
    setDay(d => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });

  // Fetch the day's assignments (delivery or pickup leg) whenever day or mode changes.
  useEffect(() => {
    let cancelled = false;
    const dayStart = new Date(day);
    const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1);
    setLoading(true);
    setError(null);
    const request = mode === 'pickup'
      ? fetchAssignedPickupsForRange(dayStart, dayEnd, token).then(d => { if (!cancelled) setPickups(d); })
      : fetchAssignedForRange(dayStart, dayEnd, token).then(d => { if (!cancelled) setDeliveries(d); });
    request
      .catch(() => { if (!cancelled) setError(mode === 'pickup' ? 'Failed to load assigned pickups' : 'Failed to load assigned orders'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [day, token, mode]);

  const courierById = useMemo(() => new Map(couriers.map(c => [c.courierId, c])), [couriers]);

  // Group the day's deliveries by courier, keeping only couriers we can resolve,
  // sorted by who was assigned the most that day.
  const deliveryRows = useMemo(
    () => groupByCourier(deliveries, courierById),
    [deliveries, courierById],
  );
  const pickupRows = useMemo(
    () => groupByCourier(pickups, courierById),
    [pickups, courierById],
  );

  const rows = mode === 'pickup' ? pickupRows : deliveryRows;
  const totalAssigned = mode === 'pickup' ? pickups.length : deliveries.length;
  // Pickup mode: total single orders (packages) collected across all batches that day.
  const totalSingleOrders = useMemo(
    () => pickups.reduce((sum, p) => sum + p.numberOfPackages, 0),
    [pickups],
  );

  if (couriers.length === 0) {
    return (
      <div className="content-card">
        <div className="content-card__header">
          <span className="content-card__title">All Couriers</span>
        </div>
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="14" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 36c0-7.732 6.268-12 14-12s14 4.268 14 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">No couriers yet</span>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={onAdd}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add First Courier
          </button>
        </div>
      </div>
    );
  }

  if (view === 'all') {
    return (
      <AllCouriersList
        couriers={couriers}
        token={token}
        onBack={() => setView('today')}
        onEdit={onEdit}
        onActiveChanged={onActiveChanged}
      />
    );
  }

  return (
    <>
      {/* Global day navigator — controls every courier below */}
      <div className="content-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 100, padding: 2 }}>
            {(['delivery', 'pickup'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '5px 14px', borderRadius: 100, border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-body)',
                  background: mode === m ? 'var(--color-accent)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--color-text-subtle)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {m === 'delivery' ? t.crwModeDelivery : t.crwModePickup}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-subtle)' }}>
            {mode === 'pickup' ? t.crwNavPickedUpOn : t.crwNavAssignedOn}
          </span>
          <button className="go-action-btn go-action-btn--ghost" style={{ padding: '5px 11px', fontSize: '0.85rem', lineHeight: 1 }} onClick={() => shiftDay(-1)} title="Previous day">‹</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 210, justifyContent: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>
              {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {isToday && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 100, padding: '1px 8px' }}>Today</span>
            )}
          </div>
          <button className="go-action-btn go-action-btn--ghost" style={{ padding: '5px 11px', fontSize: '0.85rem', lineHeight: 1, opacity: isToday ? 0.4 : 1 }} onClick={() => !isToday && shiftDay(1)} disabled={isToday} title="Next day">›</button>
          {!isToday && (
            <button className="go-action-btn go-action-btn--ghost" style={{ padding: '5px 11px', fontSize: '0.75rem' }} onClick={() => setDay(today)}>Today</button>
          )}
          <button className="go-action-btn" style={{ padding: '5px 13px', fontSize: '0.75rem' }} onClick={() => setView('all')}>
            All Couriers ›
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            {rows.length} courier{rows.length !== 1 ? 's' : ''} ·{' '}
            {mode === 'pickup'
              ? <>{totalAssigned} {t.crwModePickup.toLowerCase()} · {totalSingleOrders} {t.crwOrdersWord}</>
              : <>{totalAssigned} assigned</>}
          </span>
        </div>
      </div>

      <div className="content-card">
        <div className="content-card__header">
          <span className="content-card__title">{mode === 'pickup' ? t.crwTitlePickups : t.crwTitleDeliveries}</span>
        </div>
        {loading ? (
          <div className="go-loading"><div className="go-spinner" />{mode === 'pickup' ? t.crwLoadingPickups : t.crwLoadingDeliveries}</div>
        ) : error ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
            {mode === 'pickup' ? t.crwEmptyPickups : t.crwEmptyDeliveries}
          </div>
        ) : mode === 'pickup' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pickupRows.map(r => (
              <CourierPickupRow
                key={r.courier.courierId}
                courier={r.courier}
                pickups={r.items}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {deliveryRows.map(r => (
              <CourierRow
                key={r.courier.courierId}
                courier={r.courier}
                orders={r.items}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Plain roster of every courier with management actions ─────────────────────
function AllCouriersList({
  couriers,
  token,
  onBack,
  onEdit,
  onActiveChanged,
}: {
  couriers: Courier[];
  token: string;
  onBack: () => void;
  onEdit: (courier: Courier) => void;
  onActiveChanged: (courierId: string, isActive: boolean) => void;
}) {
  const { t } = useLanguage();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [confirmCourier, setConfirmCourier] = useState<Courier | null>(null);

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  };

  const handleToggleActive = async (courier: Courier) => {
    setTogglingId(courier.courierId);
    try {
      const isActive = courier.isDeleted; // toggling: if deleted -> activate, if active -> deactivate
      await setCourierActiveStatus(courier.courierId, isActive, token);
      onActiveChanged(courier.courierId, isActive);
    } catch {
      showToast(t.courierToggleFailed, true);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="content-card">
      <div className="content-card__header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="go-action-btn go-action-btn--ghost" style={{ padding: '5px 11px', fontSize: '0.8rem' }} onClick={onBack}>
          ‹ Working Today
        </button>
        <span className="content-card__title">All Couriers</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
          {couriers.length} courier{couriers.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {couriers.map(courier => (
          <div
            key={courier.courierId}
            style={{ borderBottom: '1px solid var(--color-border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, opacity: courier.isDeleted ? 0.6 : 1 }}
          >
            <div style={{ flex: 1 }}>
              <div className="courier-name">
                {courier.fullName}
                {courier.isDeleted && (
                  <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 100, padding: '1px 8px' }}>{t.courierDeactivatedBadge}</span>
                )}
              </div>
              <div className="courier-username">@{courier.username} · {courier.assignedCity}, {courier.assignedDistrict}</div>
            </div>
            <span style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
              {courier.phoneNumber}
            </span>
            <span className={`status-badge ${!courier.isDeleted ? 'status-badge--delivered' : 'status-badge--cancelled'}`}>
              {!courier.isDeleted ? t.courierStatusActive : t.courierStatusDeleted}
            </span>
            <button
              className="go-action-btn go-action-btn--ghost"
              style={{ padding: '5px 13px', fontSize: '0.75rem' }}
              onClick={() => onEdit(courier)}
            >
              Edit
            </button>
            <button
              className="go-action-btn"
              style={{
                padding: '5px 13px', fontSize: '0.75rem',
                background: !courier.isDeleted ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                color: !courier.isDeleted ? '#ef4444' : '#10b981',
                border: `1px solid ${!courier.isDeleted ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
              }}
              onClick={() => setConfirmCourier(courier)}
              disabled={togglingId === courier.courierId}
            >
              {togglingId === courier.courierId ? '…' : !courier.isDeleted ? t.courierDeactivate : t.courierActivate}
            </button>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{ padding: '8px 20px', fontSize: '0.78rem', color: toast.err ? '#ef4444' : '#10b981', fontWeight: 600 }}>
          {toast.msg}
        </div>
      )}
      {confirmCourier && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '28px 32px', maxWidth: 380, width: '90%', textAlign: 'center', boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 24, color: 'var(--color-text)' }}>
              {confirmCourier.isDeleted ? t.courierConfirmActivate(confirmCourier.fullName) : t.courierConfirmDeactivate(confirmCourier.fullName)}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmCourier(null)}
                style={{ padding: '8px 20px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleToggleActive(confirmCourier)}
                disabled={togglingId === confirmCourier.courierId}
                style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: confirmCourier.isDeleted ? '#10b981' : '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}
              >
                {confirmCourier.isDeleted ? t.courierActivate : t.courierDeactivate}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Single expandable courier row ─────────────────────────────────────────────
// One courier's pickups (group-order collections) for the selected day, read-only.
function CourierPickupRow({ courier, pickups }: { courier: Courier; pickups: CourierDayPickup[]; }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();

  const totalPackages = useMemo(
    () => pickups.reduce((sum, p) => sum + p.numberOfPackages, 0),
    [pickups],
  );

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Header row */}
      <div
        className="go-row-header"
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, opacity: courier.isDeleted ? 0.6 : 1 }}
      >
        <svg
          className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`}
          width="14" height="14" viewBox="0 0 16 16" fill="none"
        >
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1 }}>
          <div className="courier-name">
            {courier.fullName}
            {courier.isDeleted && (
              <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 100, padding: '1px 8px' }}>{t.courierDeactivatedBadge}</span>
            )}
          </div>
          <div className="courier-username">@{courier.username} · {courier.assignedCity}, {courier.assignedDistrict}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent)', background: 'var(--color-accent-dim)', border: '1px solid rgba(196,127,23,0.25)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              {t.crwAssigned(pickups.length)}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-subtle)', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              {t.goPkgs(totalPackages)}
            </span>
          </div>
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
            {courier.phoneNumber}
          </span>
        </div>
      </div>

      {/* Pickups for the selected day (read-only) */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)', animation: 'expand-in 0.15s ease both' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="go-orders-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>{t.crwThSender}</th>
                  <th>{t.crwThPickupLocation}</th>
                  <th>{t.crwThAddress}</th>
                  <th>{t.crwThPackages}</th>
                  <th>{t.aopThStatus}</th>
                  <th>{t.crwThPickedUp}</th>
                </tr>
              </thead>
              <tbody>
                {pickups.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.senderBusinessName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', fontFamily: 'Courier New, monospace' }}>{p.senderPhone}</div>
                    </td>
                    <td>
                      <div>{p.pickUpCity}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{p.pickUpDistrict}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', maxWidth: 220 }}>{p.pickUpAddress}</td>
                    <td style={{ fontWeight: 600 }}>{p.numberOfPackages}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {p.pickedUpAt ? new Date(p.pickedUpAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CourierRow({ courier, orders }: { courier: Courier; orders: CourierOrder[]; }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();

  const salaryTotal = useMemo(
    () => orders.reduce((sum, o) => sum + (o.courierSalary ?? 0), 0),
    [orders],
  );
  const serviceTotal = useMemo(
    () => orders.reduce((sum, o) => sum + o.companyServicePrice, 0),
    [orders],
  );
  const codTotal = useMemo(
    () => orders.reduce((sum, o) => sum + (o.amountToCollectForPackage ?? 0), 0),
    [orders],
  );
  const combinedTotal = serviceTotal + codTotal;

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Header row */}
      <div
        className="go-row-header"
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, opacity: courier.isDeleted ? 0.6 : 1 }}
      >
        <svg
          className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`}
          width="14" height="14" viewBox="0 0 16 16" fill="none"
        >
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1 }}>
          <div className="courier-name">
            {courier.fullName}
            {courier.isDeleted && (
              <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 100, padding: '1px 8px' }}>{t.courierDeactivatedBadge}</span>
            )}
          </div>
          <div className="courier-username">@{courier.username} · {courier.assignedCity}, {courier.assignedDistrict}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent)', background: 'var(--color-accent-dim)', border: '1px solid rgba(196,127,23,0.25)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              {t.crwAssigned(orders.length)}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-subtle)', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              {t.crwSalaryBadge} ₾{salaryTotal.toFixed(2)}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-subtle)', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              {t.crwServiceBadge} ₾{serviceTotal.toFixed(2)}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-subtle)', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              COD ₾{codTotal.toFixed(2)}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
              {t.crwTotalBadge} ₾{combinedTotal.toFixed(2)}
            </span>
          </div>
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
            {courier.phoneNumber}
          </span>
        </div>
      </div>

      {/* Deliveries for the selected day (read-only) */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)', animation: 'expand-in 0.15s ease both' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="go-orders-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>{t.aopThTracking}</th>
                  <th>{t.aopThRecipient}</th>
                  <th>{t.aopThCityDistrict}</th>
                  <th>{t.aopThStatus}</th>
                  <th>{t.crwThSvcPrice}</th>
                  <th>{t.crwThCourierSalary}</th>
                  <th>{t.aopThRevenue}</th>
                  <th>{t.crwThDelivered}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const deliveredIso = o.deliveredAt ?? o.deliveredToWarehouseAt;
                  return (
                    <tr key={o.id}>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', fontFamily: 'Courier New, monospace' }}>{o.recipientPhone}</div>
                      </td>
                      <td>
                        <div>{o.recipientCity}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientDistrict}</div>
                      </td>
                      <td><StatusBadge status={o.status} /></td>
                      <td style={{ fontWeight: 600 }}>₾{o.companyServicePrice.toFixed(2)}</td>
                      <td>
                        {o.courierSalary != null
                          ? <span style={{ color: '#f97316', fontWeight: 600 }}>₾{o.courierSalary.toFixed(2)}</span>
                          : <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      <td>
                        {o.companyRevenue != null
                          ? <span style={{ color: o.companyRevenue >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>₾{o.companyRevenue.toFixed(2)}</span>
                          : <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                        {deliveredIso ? new Date(deliveredIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
