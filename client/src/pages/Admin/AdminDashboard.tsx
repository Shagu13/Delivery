import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { CreateCourierModal } from './CreateCourierModal';
import type { CreateCourierResponse, Courier, CourierOrder } from '../../api/couriers';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import { fetchCouriers, fetchCourierOrders, setCourierSalary } from '../../api/couriers';
import { AdminGroupOrderActions, AdminOrderRowActions } from './AdminGroupOrderActions';
import AdminCustomersPage from './AdminCustomersPage';
import AdminCitiesPage from './AdminCitiesPage';
import '../../styles/dashboard.css';

type AdminView = 'overview' | 'orders' | 'couriers' | 'customers' | 'cities';

export function AdminDashboard() {
  const { user, signOut, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tabParam    = searchParams.get('tab') ?? '';
  const statusParam = searchParams.get('status') ?? '';

  const [sidebarView, setSidebarView] = useState<AdminView>('overview');
  const activeView: AdminView = tabParam === 'orders' ? 'orders' : sidebarView;

  const goTo = (view: AdminView) => {
    navigate('/admin', { replace: true });
    setSidebarView(view);
  };

  const [showCreateCourier, setShowCreateCourier] = useState(false);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Load couriers from DB on mount
  useEffect(() => {
    if (!token) return;
    fetchCouriers(token).then(setCouriers).catch(() => {});
  }, [token]);

  const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };

  const handleCourierCreated = (courier: CreateCourierResponse) => {
    // Reload full list so new courier has all fields
    if (token) fetchCouriers(token).then(setCouriers).catch(() => {});
    setShowCreateCourier(false);
    setToast(`Courier "${courier.fullName}" created successfully.`);
    setTimeout(() => setToast(null), 4000);
    goTo('couriers');
  };

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'A';

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
        <span className="sidebar__role-badge">Admin</span>
        <div className="sidebar__divider" />
        <p className="sidebar__section-label">Management</p>
        <nav className="sidebar__nav">
          <button className={`sidebar__link ${activeView === 'overview' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('overview')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Overview
          </button>
          <button className={`sidebar__link ${activeView === 'orders' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('orders')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 5.5h7M4.5 8h5M4.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Group Orders
          </button>
          <button className={`sidebar__link ${activeView === 'couriers' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('couriers')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Couriers
            {couriers.length > 0 && <span className="sidebar__badge">{couriers.length}</span>}
          </button>
          <button className={`sidebar__link ${activeView === 'customers' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('customers')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1 14c0-2.5 2-4 4.5-4M8 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Customers
          </button>
          <button className={`sidebar__link ${activeView === 'cities' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('cities')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="7" width="14" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M8 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Cities &amp; Districts
          </button>
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initials}</div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user?.firstName} {user?.lastName}</div>
              <div className="sidebar__user-handle">@{user?.username}</div>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleSignOut}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="dashboard__body">
        <div className="dashboard__topbar">
          <span className="dashboard__topbar-title">
            {activeView === 'overview'  && 'Overview'}
            {activeView === 'orders'    && 'Group Orders'}
            {activeView === 'couriers'  && 'Couriers'}
            {activeView === 'customers' && 'Customers'}
            {activeView === 'cities'    && 'Cities & Districts'}
          </span>
          {activeView === 'couriers' && (
            <button className="btn-primary" onClick={() => setShowCreateCourier(true)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Add Courier
            </button>
          )}
        </div>
        <main className="dashboard__content">
          {activeView === 'overview'  && <AdminOverview />}
          {activeView === 'orders'    && <AdminOrders key={statusParam} initialStatus={statusParam} />}
          {activeView === 'couriers'  && <AdminCouriers couriers={couriers} token={token ?? ''} onAdd={() => setShowCreateCourier(true)} />}
          {activeView === 'customers' && <AdminCustomersPage token={token ?? ''} />}
          {activeView === 'cities'    && <AdminCitiesPage token={token ?? ''} />}
        </main>
      </div>

      <CreateCourierModal
        key={showCreateCourier ? 'open' : 'closed'}
        open={showCreateCourier}
        onClose={() => setShowCreateCourier(false)}
        onCreated={handleCourierCreated}
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
        .go-row-header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; cursor: pointer; transition: background var(--transition); user-select: none; }
        .go-row-header:hover { background: var(--color-bg-3); }
        .go-chevron { color: var(--color-text-subtle); flex-shrink: 0; transition: transform 0.18s ease; }
        .go-chevron--open { transform: rotate(90deg); }
        .go-sender { flex: 1; min-width: 0; }
        .go-sender__biz { font-weight: 600; font-size: 0.9rem; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .go-sender__name { font-size: 0.775rem; color: var(--color-text-subtle); margin-top: 1px; }
        .go-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .go-meta__phone { font-size: 0.78rem; color: var(--color-text-subtle); font-family: 'Courier New', monospace; }
        .go-meta__city { font-size: 0.78rem; color: var(--color-text-subtle); }
        .go-meta__pkgs { font-size: 0.75rem; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: 100px; padding: 2px 9px; color: var(--color-text-muted); white-space: nowrap; }
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
        /* ── Action buttons ── */
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
        /* ── Action toast ── */
        .action-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 9px; background: var(--color-text); color: var(--color-bg); border-radius: var(--radius-md); padding: 12px 20px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2); animation: toast-in 0.25s ease both; white-space: nowrap; }
        .action-toast--err { background: #ef4444; color: #fff; }
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

function statusClass(status: string): string {
  const map: Record<string, string> = {
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
    CourierRecievedOrderToDeliver:   'delivering',
    OrderIsBeingDeliveredToRecipient:'delivering',
    DeliveredToRecipient:            'delivered',
    CancelledBySender:               'cancelled',
    CancelledByAdmin:                'cancelled',
    OrderNotAccepted:                'declined',
  };
  return map[status] ?? 'pending';
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/([A-Z])/g, ' $1').trim();
  return (
    <span className={`status-badge status-badge--${statusClass(status)}`}>
      {label}
    </span>
  );
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function AdminOverview() {
  return (
    <>
      <div className="stat-grid">
        {[
          { label: 'Total Orders',    value: '—', sub: 'All time' },
          { label: 'Pending Pickup',  value: '—', sub: 'Awaiting courier' },
          { label: 'In Transit',      value: '—', sub: 'Active deliveries' },
          { label: 'Active Couriers', value: '—', sub: 'Available now' },
        ].map((s, i) => (
          <div className="stat-card" key={s.label} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="stat-card__label">{s.label}</div>
            <div className="stat-card__value">{s.value}</div>
            <div className="stat-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="content-card">
        <div className="content-card__header">
          <span className="content-card__title">Recent Group Orders</span>
        </div>
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">Orders will appear here</span>
        </div>
      </div>
    </>
  );
}

// Statuses that live on individual orders (not on the GroupOrder itself)
const ORDER_LEVEL_STATUSES = new Set([
  'OrderIsOnItsWayToRecipientsCity',
  'CourierAssignedToDeliver',
  'CourierRecievedOrderToDeliver',
  'DeliveredToRecipient',
  'CancelledByAdmin',
]);

const STATUS_PILLS = [
  { value: '',                                label: 'All' },
  { value: 'Pending',                         label: 'Pending' },
  { value: 'AcceptedGroupOrder',              label: 'Accepted' },
  { value: 'CourierAssignedToPickUp',         label: 'Courier Assigned (Pickup)' },
  { value: 'CourierOnTheWayToPickUp',         label: 'On The Way' },
  { value: 'CourierDeliveringToWarehouse',    label: 'To Warehouse' },
  { value: 'DeliveredToWarehouse',            label: 'At Warehouse' },
  { value: 'AdminAcceptedOrderInWareHouse',   label: 'Warehouse Accepted' },
  { value: 'OrderIsOnItsWayToRecipientsCity', label: 'Sent To City' },
  { value: 'CourierAssignedToDeliver',        label: 'Courier Assigned (Delivery)' },
  { value: 'CourierRecievedOrderToDeliver',   label: 'Courier Received' },
  { value: 'DeliveredToRecipient',            label: 'Delivered' },
  { value: 'CancelledBySender',               label: 'Cancelled (Sender)' },
  { value: 'CancelledByAdmin',                label: 'Cancelled (Admin)' },
  { value: 'OrderNotAccepted',                label: 'Declined' },
];

function AdminOrders({ initialStatus = '' }: { initialStatus?: string }) {
  const { token } = useAuth();
  const [groupOrders, setGroupOrders]   = useState<AdminGroupOrder[]>([]);
  const [couriers,    setCouriers]      = useState<Courier[]>([]);
  const [loading,     setLoading]       = useState(true);
  const [error,       setError]         = useState<string | null>(null);
  const [search,      setSearch]        = useState('');
  const [filterParty,    setFilterParty]    = useState<'sender' | 'recipient'>('sender');
  const [filterCity,     setFilterCity]     = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterStatus,   setFilterStatus]   = useState(initialStatus);
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [actionToast,    setActionToast]    = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setError(e instanceof Error ? e.message : 'Failed to load group orders.');
    } finally {
      setLoading(false);
    }
  }, [token]);

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

  // Fetch courier list for assign-courier pickers
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

  const handlePartyChange = (party: 'sender' | 'recipient') => { setFilterParty(party); setFilterCity(''); setFilterDistrict(''); };
  const handleCityChange  = (city: string) => { setFilterCity(city); setFilterDistrict(''); };

  const availableCities = useMemo(() => {
    if (filterParty === 'sender') return [...new Set(groupOrders.map(go => go.pickUpCity))].sort();
    return [...new Set(groupOrders.flatMap(go => go.orders.map(o => o.recipientCity)))].sort();
  }, [groupOrders, filterParty]);

  const availableDistricts = useMemo(() => {
    if (!filterCity) return [];
    if (filterParty === 'sender') return [...new Set(groupOrders.filter(go => go.pickUpCity === filterCity).map(go => go.pickUpDistrict))].sort();
    return [...new Set(groupOrders.flatMap(go => go.orders).filter(o => o.recipientCity === filterCity).map(o => o.recipientDistrict))].sort();
  }, [groupOrders, filterParty, filterCity]);

  const visibleOrders = useMemo(() => {
    return groupOrders.filter(go => {
      if (filterStatus) {
        // Order-level statuses live on child orders, not on the GroupOrder
        if (ORDER_LEVEL_STATUSES.has(filterStatus)) {
          if (!go.orders.some(o => o.status === filterStatus)) return false;
        } else {
          if (go.status !== filterStatus) return false;
        }
      }
      if (!filterCity && !filterDistrict) return true;
      if (filterParty === 'sender') {
        if (filterCity     && go.pickUpCity     !== filterCity)     return false;
        if (filterDistrict && go.pickUpDistrict !== filterDistrict) return false;
        return true;
      }
      return go.orders.some(o => {
        if (filterCity     && o.recipientCity     !== filterCity)     return false;
        if (filterDistrict && o.recipientDistrict !== filterDistrict) return false;
        return true;
      });
    });
  }, [groupOrders, filterStatus, filterCity, filterDistrict, filterParty]);

  const hasLocationFilter = filterCity || filterDistrict;
  const hasFilters        = search || hasLocationFilter || filterStatus;
  const clearAll          = () => { setSearch(''); setFilterCity(''); setFilterDistrict(''); setFilterStatus(''); };

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>

      {/* Search */}
      <div className="go-toolbar go-toolbar--search">
        <div className="go-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by sender, recipient, phone, city, address, TN…"
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
        {!loading && !error && (
          <span className="go-count">
            {visibleOrders.length}{visibleOrders.length !== groupOrders.length ? `/${groupOrders.length}` : ''} group order{visibleOrders.length !== 1 ? 's' : ''}{hasFilters ? ' matched' : ''}
          </span>
        )}
      </div>

      {/* Location filter */}
      <div className="go-toolbar go-toolbar--filters">
        <span className="go-filter-label">Filter by location</span>
        <div className="go-filter-chain">
          <div className="go-filter-step">
            <span className="go-step-label">Party</span>
            <div className="go-seg">
              <button className={`go-seg__btn ${filterParty === 'sender' ? 'go-seg__btn--active' : ''}`} onClick={() => handlePartyChange('sender')}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3 2.686-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                Sender
              </button>
              <button className={`go-seg__btn ${filterParty === 'recipient' ? 'go-seg__btn--active' : ''}`} onClick={() => handlePartyChange('recipient')}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Recipient
              </button>
            </div>
          </div>
          <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div className="go-filter-step">
            <span className="go-step-label">City</span>
            <div className="go-select-wrap">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6c0-2.485-2.015-4.5-4.5-4.5zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" stroke="currentColor" strokeWidth="1.2"/></svg>
              <select className="go-select" value={filterCity} onChange={e => handleCityChange(e.target.value)} disabled={loading || availableCities.length === 0}>
                <option value="">All cities</option>
                {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          {filterCity && (
            <>
              <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div className="go-filter-step">
                <span className="go-step-label">District</span>
                <div className="go-select-wrap">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>
                  <select className="go-select" value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)} disabled={availableDistricts.length === 0}>
                    <option value="">All districts</option>
                    {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </>
          )}
        </div>
        {hasLocationFilter && (
          <button className="go-clear-btn" onClick={clearAll}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            Clear
          </button>
        )}
      </div>

      {/* Status pills */}
      <div className="go-toolbar go-status-bar">
        <span className="go-filter-label">Status</span>
        {STATUS_PILLS.map(({ value, label }) => (
          <button
            key={value || 'all'}
            className={`go-status-pill ${filterStatus === value ? 'go-status-pill--active' : ''}`}
            onClick={() => setFilterStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && <div className="go-loading"><div className="go-spinner" />Loading group orders…</div>}
      {!loading && error && <div className="go-error">{error}</div>}
      {!loading && !error && visibleOrders.length === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{hasFilters ? 'No group orders match your filters.' : 'No group orders yet.'}</span>
        </div>
      )}

      {/* Group order list */}
      {!loading && !error && visibleOrders.length > 0 && (
        <div className="go-list">
          {visibleOrders.map(go => {
            const expanded = expandedIds.has(go.id);
            return (
              <div className="go-row" key={go.id}>
                <div className="go-row-header" onClick={() => toggleExpand(go.id)}>
                  <svg className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="go-sender">
                    <div className="go-sender__biz">{go.senderBusinessName}</div>
                    <div className="go-sender__name">{go.senderFirstName} {go.senderLastName}</div>
                  </div>
                  <div className="go-meta">
                    <span className="go-meta__phone">{go.senderPhone}</span>
                    <span className="go-meta__city">{go.pickUpCity}, {go.pickUpDistrict}</span>
                    <StatusBadge status={go.status} />
                    <span className="go-meta__pkgs">{go.numberOfPackages} pkg{go.numberOfPackages !== 1 ? 's' : ''}</span>
                    <span className="go-meta__date">{formatDate(go.createdAt)}</span>
                  </div>
                  {/* ── Action buttons ── */}
                  <AdminGroupOrderActions
                    groupOrder={go}
                    couriers={couriers}
                    token={token ?? ''}
                    onSuccess={msg => showToast(msg)}
                    onError={msg => showToast(msg, 'err')}
                    onRefresh={() => load(search)}
                  />
                </div>

                {expanded && (
                  <div className="go-orders">
                    <div style={{ overflowX: 'auto' }}>
                      <table className="go-orders-table">
                        <thead>
                          <tr>
                            <th>Tracking №</th>
                            <th>Recipient</th>
                            <th>Phone</th>
                            <th>City / District</th>
                            <th>Address</th>
                            <th>Description</th>
                            <th>Status</th>
                            <th>Paid</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {go.orders.map(o => (
                            <tr key={o.id}>
                              <td><span className="tn-badge">{o.trackingNumber}</span></td>
                              <td><div style={{ fontWeight: 600 }}>{o.recipientFirstName} {o.recipientLastName}</div></td>
                              <td style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>{o.recipientPhone}</td>
                              <td>
                                <div>{o.recipientCity}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientDistrict}</div>
                              </td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{o.recipientAddress}</td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 160 }}>
                                {o.description ?? <span style={{ opacity: 0.4 }}>—</span>}
                              </td>
                              <td><StatusBadge status={o.status} /></td>
                              <td>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: o.isPaid ? '#10b981' : '#ef4444' }}>
                                  {o.isPaid ? '✓ Paid' : '✗ Unpaid'}
                                </span>
                              </td>
                              <td>
                                <AdminOrderRowActions
                                  order={o}
                                  couriers={couriers}
                                  token={token ?? ''}
                                  onSuccess={msg => showToast(msg)}
                                  onError={msg => showToast(msg, 'err')}
                                  onRefresh={() => load(search)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {go.note && <div className="go-note"><strong>Note:</strong> {go.note}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action toast */}
      {actionToast && (
        <div className={`action-toast ${actionToast.type === 'err' ? 'action-toast--err' : ''}`} role="status">
          {actionToast.msg}
        </div>
      )}
    </div>
  );
}

function AdminCouriers({
  couriers,
  token,
  onAdd,
}: {
  couriers: Courier[];
  token: string;
  onAdd: () => void;
}) {
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
  return (
    <div className="content-card">
      <div className="content-card__header">
        <span className="content-card__title">All Couriers</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
          {couriers.length} account{couriers.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {couriers.map(c => (
          <CourierRow key={c.courierId} courier={c} token={token} />
        ))}
      </div>
    </div>
  );
}

// ── Single expandable courier row ─────────────────────────────────────────────
function CourierRow({ courier, token }: { courier: Courier; token: string }) {
  const [expanded,   setExpanded]   = useState(false);
  const [orders,     setOrders]     = useState<CourierOrder[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [bulkSalary, setBulkSalary] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [rowToast,   setRowToast]   = useState<{ msg: string; err: boolean } | null>(null);

  const showRowToast = (msg: string, err = false) => {
    setRowToast({ msg, err });
    setTimeout(() => setRowToast(null), 3500);
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCourierOrders(courier.courierId, token);
      setOrders(data);
    } catch {
      showRowToast('Failed to load orders', true);
    } finally {
      setLoading(false);
    }
  }, [courier.courierId, token]);

  const handleToggle = () => {
    if (!expanded && orders.length === 0) void loadOrders();
    setExpanded(v => !v);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map(o => o.id)));
  };

  const handleBulkSave = async () => {
    const salary = parseFloat(bulkSalary);
    if (isNaN(salary) || salary < 0) { showRowToast('Enter a valid salary amount', true); return; }
    if (selected.size === 0) { showRowToast('Select at least one order', true); return; }
    setSaving(true);
    try {
      await Promise.all([...selected].map(id => setCourierSalary(id, salary, token)));
      await loadOrders();
      setSelected(new Set());
      setBulkSalary('');
      showRowToast(`Salary set for ${selected.size} order${selected.size !== 1 ? 's' : ''}`);
    } catch {
      showRowToast('Failed to save salary', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Header row */}
      <div
        className="go-row-header"
        onClick={handleToggle}
        style={{ cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <svg
          className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`}
          width="14" height="14" viewBox="0 0 16 16" fill="none"
        >
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1 }}>
          <div className="courier-name">{courier.fullName}</div>
          <div className="courier-username">@{courier.username} · {courier.assignedCity}, {courier.assignedDistrict}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
            {courier.phoneNumber}
          </span>
          <span className={`status-badge ${courier.isAvailable ? 'status-badge--delivered' : 'status-badge--cancelled'}`}>
            {courier.isAvailable ? 'Available' : 'Unavailable'}
          </span>
        </div>
      </div>

      {/* Orders panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)', animation: 'expand-in 0.15s ease both' }}>
          {loading && (
            <div className="go-loading"><div className="go-spinner" />Loading orders…</div>
          )}
          {!loading && orders.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
              No orders assigned to this courier.
            </div>
          )}
          {!loading && orders.length > 0 && (
            <>
              {/* Bulk salary bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Select orders to set salary'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Courier salary"
                  value={bulkSalary}
                  onChange={e => setBulkSalary(e.target.value)}
                  style={{
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                    fontSize: '0.825rem', padding: '6px 10px', width: 140, outline: 'none',
                  }}
                  disabled={selected.size === 0 || saving}
                />
                <button
                  className="go-action-btn go-action-btn--assign"
                  onClick={handleBulkSave}
                  disabled={selected.size === 0 || saving || bulkSalary === ''}
                >
                  {saving ? 'Saving…' : `Set Salary (${selected.size})`}
                </button>
                {rowToast && (
                  <span style={{ fontSize: '0.78rem', color: rowToast.err ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                    {rowToast.msg}
                  </span>
                )}
              </div>

              {/* Orders table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="go-orders-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={selected.size === orders.length}
                          onChange={toggleAll}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th>Tracking №</th>
                      <th>Recipient</th>
                      <th>City / District</th>
                      <th>Status</th>
                      <th>Service Price</th>
                      <th>Courier Salary</th>
                      <th>Revenue</th>
                      <th>Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} style={{ background: selected.has(o.id) ? 'var(--color-accent-dim)' : undefined }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(o.id)}
                            onChange={() => toggleSelect(o.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td><span className="tn-badge">{o.trackingNumber}</span></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{o.recipientFirstName} {o.recipientLastName}</div>
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
                          {o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString('en-GB') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
