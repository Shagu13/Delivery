import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { CreateCourierModal } from './CreateCourierModal';
import { EditCourierModal } from './EditCourierModal';
import { SettlementModal } from './SettlementModal';
import type { CreateCourierResponse, Courier, CourierOrder } from '../../api/couriers';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import { fetchCouriers, fetchCourierOrders, setCourierSalary, setCourierActiveStatus } from '../../api/couriers';
import { assignCourierToOrder } from '../../api/orders';
import { AdminGroupOrderActions, AdminOrderRowActions } from './AdminGroupOrderActions';
import AdminCustomersPage from './AdminCustomersPage';
import AdminCitiesPage from './AdminCitiesPage';
import AdminOrdersPage from './AdminOrdersPage';
import { useLanguage } from '../../contexts/useLanguage';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { getStatusMeta } from '../../utils/statusMeta';
import '../../styles/dashboard.css';
import { fetchSmsBalance } from '../../api/sms';
import AdminWeightPriceTiersPage from './AdminWeightPriceTiersPage';
import AdminHistoryPage from './AdminHistoryPage';
import { isCompletedGroupOrder } from '../../utils/groupOrderUtils';


type AdminView = 'overview' | 'orders' | 'packages' | 'couriers' | 'customers' | 'cities' | 'weightTiers' | 'history';

export function AdminDashboard() {
  const { user, signOut, token } = useAuth();
  const { t } = useLanguage();
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
  const [editCourier, setEditCourier] = useState<Courier | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const handleCourierUpdated = (courierId: string, newUsername: string) => {
    setCouriers(prev => prev.map(c => c.courierId === courierId ? { ...c, username: newUsername } : c));
  };

  const handleCourierActiveChanged = (courierId: string, isActive: boolean) => {
    setCouriers(prev => prev.map(c => c.courierId === courierId ? { ...c, isActive } : c));
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
          <button className={`sidebar__link ${activeView === 'orders' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('orders')} title={t.sidebarGroupOrders}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 5.5h7M4.5 8h5M4.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarGroupOrders}</span>
          </button>
          <button className={`sidebar__link ${activeView === 'packages' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('packages')} title={t.topbarPackages}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M1 8h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.topbarPackages}</span>
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
            {activeView === 'orders'    && t.topbarOrders}
            {activeView === 'packages'  && t.topbarPackages}
            {activeView === 'couriers'  && t.topbarCouriers}
            {activeView === 'customers' && t.topbarCustomers}
            {activeView === 'cities' && t.topbarCities}
            {activeView === 'weightTiers' && t.topbarWeightTiers}
            {activeView === 'history' && t.topbarHistory}
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
          {activeView === 'history' && <AdminHistoryPage token={token ?? ''} />}
        </main>
      </div>

      <CreateCourierModal
        key={showCreateCourier ? 'open' : 'closed'}
        open={showCreateCourier}
        onClose={() => setShowCreateCourier(false)}
        onCreated={handleCourierCreated}
      />

      <EditCourierModal
        open={editCourier !== null}
        courier={editCourier}
        token={token ?? ''}
        onClose={() => setEditCourier(null)}
        onUpdated={(id, username) => { handleCourierUpdated(id, username); }}
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
    const activeCouriers = couriers.filter(c => c.isAvailable).length;

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
  // Bulk-assign state
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkCourierId,    setBulkCourierId]    = useState('');
  const [bulkAssigning,    setBulkAssigning]    = useState(false);
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
      setError(e instanceof Error ? e.message : t.goLoadingOrders);
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
      // Base rule: when no status pill is selected, show only active (non-completed) group orders.
      // Completed orders (all delivered / all cancelled / declined) live in the History page.
      if (!filterStatus && isCompletedGroupOrder(go)) return false;

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

  const hasLocationFilter = filterCity || filterDistricts.length > 0;
  const hasFilters        = search || hasLocationFilter || filterStatus;
  const clearAll          = () => { setSearch(''); setFilterCity(''); setFilterDistricts([]); setFilterStatus(''); };

  // Returns only the orders that match the active recipient city/district filter
  // (returns all orders when in sender mode or when no location filter is active)
  const visibleOrdersFor = useCallback((go: AdminGroupOrder) => {
    if (filterParty !== 'recipient' || (!filterCity && filterDistricts.length === 0)) return go.orders;
    return go.orders.filter(o => {
      if (filterCity                && o.recipientCity     !== filterCity)     return false;
      if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
      return true;
    });
  }, [filterParty, filterCity, filterDistricts]);

  // Bulk-assign all selected orders to one courier in parallel
  const handleBulkAssign = async () => {
    if (!bulkCourierId || selectedOrderIds.size === 0) return;
    setBulkAssigning(true);
    const ids = [...selectedOrderIds];
    let ok = 0; let fail = 0;
    await Promise.all(ids.map(async id => {
      try {
        await assignCourierToOrder(token ?? '', id, bulkCourierId);
        ok++;
      } catch { fail++; }
    }));
    setBulkAssigning(false);
    setSelectedOrderIds(new Set());
    setBulkCourierId('');
    void (async () => { setLoading(true); await load(search); })();
    showToast(
      fail === 0 ? t.goCourierAssigned(ok)
                 : t.goCourierAssignedFail(ok, fail),
      fail > 0 ? 'err' : 'ok'
    );
  };

  const toggleOrderSelect = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>

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
      {!loading && !error && visibleOrders.length === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{hasFilters ? t.goNoOrdersFilters : t.goNoOrders}</span>
        </div>
      )}

      {/* Bulk assign bar — appears when any orders are selected */}
      {selectedOrderIds.size > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 20px', background: 'var(--color-accent-dim)',
          borderBottom: '1px solid rgba(196,127,23,0.3)',
          animation: 'expand-in 0.15s ease both',
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--color-accent)', flexShrink: 0 }}>
            <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
            {t.goNSelected(selectedOrderIds.size)}
          </span>
          <div className="go-select-wrap" style={{ marginLeft: 4 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <select
              className="go-select"
              value={bulkCourierId}
              onChange={e => setBulkCourierId(e.target.value)}
              style={{ minWidth: 220 }}
            >
              <option value="">{t.goChooseCourier}</option>
              {couriers.map(c => (
                <option key={c.courierId} value={c.courierId}>
                  {c.fullName} — {c.assignedCity}, {c.assignedDistrict}
                </option>
              ))}
            </select>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <button
            className="go-action-btn go-action-btn--assign"
            disabled={!bulkCourierId || bulkAssigning}
            onClick={handleBulkAssign}
          >
            {bulkAssigning ? t.goAssigning : t.goAssignCourier(selectedOrderIds.size)}
          </button>
          <button
            className="go-action-btn go-action-btn--ghost"
            onClick={() => setSelectedOrderIds(new Set())}
            style={{ marginLeft: 'auto' }}
          >
            {t.goClearSelection}
          </button>
        </div>
      )}

      {/* Group order list */}
      {!loading && !error && visibleOrders.length > 0 && (() => {
        // ── Flat view: recipient party + location filter active ──────────────
        const showFlat = filterParty === 'recipient' && hasLocationFilter;

        if (showFlat) {
          // Collect all matching individual orders (with their parent group order attached)
          const flatOrders = visibleOrders.flatMap(go =>
            visibleOrdersFor(go).map(o => ({ ...o, _go: go }))
          );
          const assignableFlat = flatOrders.filter(
            o => o.status !== 'DeliveredToRecipient' && o.courierId === null
          );
          return (
            <div style={{ overflowX: 'auto' }}>
              <table className="go-orders-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        title={t.goSelectAllAssignable}
                        checked={assignableFlat.length > 0 && assignableFlat.every(o => selectedOrderIds.has(o.id))}
                        onChange={e => {
                          setSelectedOrderIds(prev => {
                            const next = new Set(prev);
                            assignableFlat.forEach(o => e.target.checked ? next.add(o.id) : next.delete(o.id));
                            return next;
                          });
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>{t.goThTracking}</th>
                    <th>{t.goThRecipient}</th>
                    <th>{t.goThPhone}</th>
                    <th>{t.goThCityDistrict}</th>
                    <th>{t.goThAddress}</th>
                    <th>{t.goThDescription}</th>
                    <th>{t.goThStatus}</th>
                    <th>{t.goThPaid}</th>
                    <th>{t.goThActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {flatOrders.map(o => (
                    <tr key={o.id} style={{ background: selectedOrderIds.has(o.id) ? 'var(--color-accent-dim)' : undefined }}>
                      <td onClick={e => e.stopPropagation()}>
                        {o.status !== 'DeliveredToRecipient' && o.courierId === null ? (
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.has(o.id)}
                            onChange={() => toggleOrderSelect(o.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        ) : (
                          <span style={{ display: 'inline-block', width: 15, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td><div style={{ fontWeight: 600 }}>{o.recipientFirstName} {o.recipientLastName}</div></td>
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
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: o.productPaymentStatus === 'Paid' ? '#10b981' : '#ef4444' }}>
                          {o.productPaymentStatus === 'Paid' ? t.goPaid : t.goUnpaid}
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
          );
        }

        // ── Default grouped accordion view ───────────────────────────────────
        return (
        <div className="go-list">
          {visibleOrders.map(go => {
            const expanded = expandedIds.has(go.id);
            const filteredOrders = visibleOrdersFor(go);
            const assignableOrders = filteredOrders.filter(
              o => o.status !== 'DeliveredToRecipient' && o.courierId === null
            );
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
                    <span className="go-meta__city">{locCity(go.pickUpCity, go.pickUpCityGeo)}, {locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}</span>
                    <StatusBadge status={go.status} />
                    <span className="go-meta__pkgs">{t.goPkgs(go.numberOfPackages)}</span>
                    <span className="go-meta__date">{formatDate(go.createdAt)}</span>
                  </div>
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
                    {filteredOrders.length === 0 ? (
                      <div style={{ padding: '16px 20px', fontSize: '0.825rem', color: 'var(--color-text-subtle)' }}>
                        {t.goNoLocationMatch}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="go-orders-table">
                          <thead>
                            <tr>
                              <th style={{ width: 36 }}>
                                <input
                                  type="checkbox"
                                  title={t.goSelectAllAssignable}
                                  checked={assignableOrders.length > 0 && assignableOrders.every(o => selectedOrderIds.has(o.id))}
                                  onChange={e => {
                                    setSelectedOrderIds(prev => {
                                      const next = new Set(prev);
                                      assignableOrders.forEach(o => e.target.checked ? next.add(o.id) : next.delete(o.id));
                                      return next;
                                    });
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                              </th>
                              <th>{t.goThTracking}</th>
                              <th>{t.goThRecipient}</th>
                              <th>{t.goThPhone}</th>
                              <th>{t.goThCityDistrict}</th>
                              <th>{t.goThAddress}</th>
                              <th>{t.goThDescription}</th>
                              <th>{t.goThStatus}</th>
                              <th>{t.goThPaid}</th>
                              <th>{t.goThActions}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredOrders.map(o => (
                              <tr key={o.id} style={{ background: selectedOrderIds.has(o.id) ? 'var(--color-accent-dim)' : undefined }}>
                                <td onClick={e => e.stopPropagation()}>
                                  {o.status !== 'DeliveredToRecipient' && o.courierId === null ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedOrderIds.has(o.id)}
                                      onChange={() => toggleOrderSelect(o.id)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                  ) : (
                                    <span style={{ display: 'inline-block', width: 15, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.75rem' }}>—</span>
                                  )}
                                </td>
                                <td><span className="tn-badge">{o.trackingNumber}</span></td>
                                <td><div style={{ fontWeight: 600 }}>{o.recipientFirstName} {o.recipientLastName}</div></td>
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
                                <td>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: o.productPaymentStatus === 'Paid' ? '#10b981' : '#ef4444' }}>
                                    {o.productPaymentStatus === 'Paid' ? t.goPaid : t.goUnpaid}
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
                    )}
                    {go.note && <div className="go-note"><strong>{t.goNote}:</strong> {go.note}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        );
      })()}

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
  onEdit,
  onActiveChanged,
}: {
  couriers: Courier[];
  token: string;
  onAdd: () => void;
  onEdit: (courier: Courier) => void;
  onActiveChanged: (courierId: string, isActive: boolean) => void;
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
          <CourierRow key={c.courierId} courier={c} token={token} onEdit={onEdit} onActiveChanged={onActiveChanged} />
        ))}
      </div>
    </div>
  );
}

// ── Single expandable courier row ─────────────────────────────────────────────
function CourierRow({ courier, token, onEdit, onActiveChanged }: { courier: Courier; token: string; onEdit: (courier: Courier) => void; onActiveChanged: (courierId: string, isActive: boolean) => void; }) {
  const [expanded,        setExpanded]        = useState(false);
  const [orders,          setOrders]          = useState<CourierOrder[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());
  const [bulkSalary,      setBulkSalary]      = useState('');
  const [saving,          setSaving]          = useState(false);
  const [rowToast,        setRowToast]        = useState<{ msg: string; err: boolean } | null>(null);
  const [showSettlement,  setShowSettlement]  = useState(false);
  const [settlementToast, setSettlementToast] = useState<string | null>(null);
  const [togglingActive,  setTogglingActive]  = useState(false);

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

  const handleToggleActive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingActive(true);
    try {
      await setCourierActiveStatus(courier.courierId, !courier.isActive, token);
      onActiveChanged(courier.courierId, !courier.isActive);
    } catch {
      showRowToast('Failed to update courier status', true);
    } finally {
      setTogglingActive(false);
    }
  };

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Header row */}
      <div
        className="go-row-header"
        onClick={handleToggle}
        style={{ cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, opacity: courier.isActive ? 1 : 0.6 }}
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
            {!courier.isActive && (
              <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 100, padding: '1px 8px' }}>Deactivated</span>
            )}
          </div>
          <div className="courier-username">@{courier.username} · {courier.assignedCity}, {courier.assignedDistrict}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
            {courier.phoneNumber}
          </span>
          <span className={`status-badge ${courier.isAvailable ? 'status-badge--delivered' : 'status-badge--cancelled'}`}>
            {courier.isAvailable ? 'Available' : 'Unavailable'}
          </span>
          <button
            className="go-action-btn go-action-btn--ghost"
            style={{ padding: '5px 13px', fontSize: '0.75rem' }}
            onClick={e => { e.stopPropagation(); onEdit(courier); }}
          >
            Edit
          </button>
          <button
            className="go-action-btn"
            style={{
              padding: '5px 13px', fontSize: '0.75rem',
              background: courier.isActive ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
              color: courier.isActive ? '#ef4444' : '#10b981',
              border: `1px solid ${courier.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
            }}
            onClick={handleToggleActive}
            disabled={togglingActive}
          >
            {togglingActive ? '…' : courier.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            className="go-action-btn go-action-btn--assign"
            style={{ padding: '5px 13px', fontSize: '0.75rem' }}
            onClick={e => { e.stopPropagation(); setShowSettlement(true); }}
          >
            Settlement
          </button>
        </div>
      </div>

      {/* Settlement toast */}
      {settlementToast && (
        <div className="action-toast" style={{ bottom: 60 }}>
          {settlementToast}
        </div>
      )}

      {/* Settlement modal */}
      <SettlementModal
        open={showSettlement}
        onClose={() => setShowSettlement(false)}
        onCreated={() => {
          setSettlementToast(`Settlement saved for ${courier.fullName}`);
          setTimeout(() => setSettlementToast(null), 4000);
        }}
        courierId={courier.courierId}
        courierFullName={courier.fullName}
        token={token}
      />

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
