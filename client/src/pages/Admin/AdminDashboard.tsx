import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../contexts/useAuth';
import { CreateCourierModal } from './CreateCourierModal';
import { EditCourierModal } from './EditCourierModal';
import { AddPackageModal } from './AddPackageModal';
import type { CreateCourierResponse, Courier, CourierOrder, CourierDayDelivery, CourierDayPickup } from '../../api/couriers';
import { fetchGroupOrders,
    fetchPickupDay, fetchCustomerUnattached, attachOrdersToGroup, mergeGroupOrders, moveOrderToGroup,
    groupAndAcceptStandalone, groupAndWarehouseStandalone, bulkAssignCourierToGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder, AdminOrder, PickupDayCustomer } from '../../api/adminGroupOrders';
import { EditOrderModal, type CustomerServicePricing } from './EditOrderModal';
import { OrderRowActionsMenu } from './OrderRowActionsMenu';
import type { AdminOrderItem } from './AdminOrdersPage';
import { fetchCouriers, fetchAssignedForDay, fetchAssignedPickupsForDay, setCourierActiveStatus } from '../../api/couriers';
import { bulkAssignCourierToOrders } from '../../api/orders';
import { AdminGroupOrderActions, AdminOrderRowActions } from './AdminGroupOrderActions';
import { recipientDisplayName } from '../../utils/recipientName';
import { PhoneActions } from '../../components/ui/PhoneActions';
import AdminCustomersPage from './AdminCustomersPage';
import AdminCitiesPage from './AdminCitiesPage';
import AdminSchedulePage from './AdminSchedulePage';
import AdminOrdersPage from './AdminOrdersPage';
import AdminPackagesPage from './AdminPackagesPage';
import { useLanguage } from '../../contexts/useLanguage';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { getStatusMeta } from '../../utils/statusMeta';
import '../../styles/dashboard.css';
import { fetchSmsBalance } from '../../api/sms';
import AdminWeightPriceTiersPage from './AdminWeightPriceTiersPage';
import AdminBankAccountsPage from './AdminBankAccountsPage';
import AdminPartnersPage from './AdminPartnersPage';
import AdminTenantSettlementsPage from './AdminTenantSettlementsPage';
import AdminTenantsPage from './AdminTenantsPage';
import { TenantFinanceView } from '../Tenant/TenantFinanceView';
import { TenantHomepageEditor } from '../Tenant/TenantHomepageEditor';
import AdminHistoryPage from './AdminHistoryPage';
import AdminFinancePage from './AdminFinancePage';
import AdminReturnExchangePage from './AdminReturnExchangePage';
import AdminOrderSearchPage from './AdminOrderSearchPage';
import AdminDeletePackagePage from './AdminDeletePackagePage';
import AdminOperatorsPage from './AdminOperatorsPage';
import { useAdminPendingCounts } from '../../realtime/useAdminPendingCounts';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { isCompletedGroupOrder } from '../../utils/groupOrderUtils';
import { georgianToday, georgianDateKeyOf } from '../../utils/georgianTime';
import { resolveDateWindow } from '../../utils/dateWindow';
import { DateRangeNav } from '../../components/ui/DateRangeNav';

// A Return order is picked up from `returnPickup*` (entered explicitly when the return was
// created) — not the "recipient" fields, which for Return orders hold the business's own
// address (where the item is ultimately returned to), not where the courier actually goes
// to collect it. No geo variant exists for return-pickup fields (plain text entry), unlike
// recipient city/district. Structural type so it works for both AdminOrder and CourierOrder.
interface PickupLocationFields {
  orderType: string;
  recipientCity: string;
  recipientCityGeo?: string;
  recipientDistrict: string;
  recipientDistrictGeo?: string;
  recipientAddress: string;
  returnPickupCity?: string | null;
  returnPickupDistrict?: string | null;
  returnPickupAddress?: string | null;
}
function pickupCityFor(o: PickupLocationFields): string {
  return o.orderType === 'Return' && o.returnPickupCity ? o.returnPickupCity : o.recipientCity;
}
function pickupCityGeoFor(o: PickupLocationFields): string | undefined {
  return o.orderType === 'Return' && o.returnPickupCity ? undefined : o.recipientCityGeo;
}
function pickupDistrictFor(o: PickupLocationFields): string {
  return o.orderType === 'Return' && o.returnPickupCity ? (o.returnPickupDistrict ?? '') : o.recipientDistrict;
}
function pickupDistrictGeoFor(o: PickupLocationFields): string | undefined {
  return o.orderType === 'Return' && o.returnPickupCity ? undefined : o.recipientDistrictGeo;
}
function pickupAddressFor(o: PickupLocationFields): string {
  return o.orderType === 'Return' && o.returnPickupCity ? (o.returnPickupAddress ?? '') : o.recipientAddress;
}

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
  CourierDeliveringToWarehouse: 1,
};
const pickupBucket = (groupStatus: string) => PICKUP_BUCKET[groupStatus] ?? 2;

// Batches a pickup courier can still be (re)assigned to — mirrors the backend's
// AssignCourierToGroupOrder precondition (Accepted, or re-assign while awaiting pickup).
// Pending is included because the assign flow accepts the batch first.
const PICKUP_ELIGIBLE = new Set(['Pending', 'AcceptedGroupOrder', 'CourierAssignedToPickUp']);

// Batches still open enough to be merged — mirrors the backend GroupOrderAppendPolicy
// (anything before the courier marks the batch picked up).
const MERGEABLE_STATUSES = new Set(['Pending', 'AcceptedGroupOrder', 'CourierAssignedToPickUp']);

// Unite a customer's same-day batches: same customer + same physical pickup address.
// Falls back to the sender phone when there's no linked customer (legacy/guest batches).
const customerGroupKey = (go: AdminGroupOrder) =>
  `${go.customerId ?? `p:${go.senderPhone}`}|${go.pickUpCity}|${go.pickUpDistrict}|${go.pickUpAddress}`;

type AdminView = 'overview' | 'orders' | 'delivery' | 'packages' | 'couriers' | 'customers' | 'cities' | 'schedule' | 'weightTiers' | 'bankAccounts' | 'partners' | 'tenants' | 'tenantSettlements' | 'history' | 'returnExchange' | 'finance' | 'operators' | 'homepage' | 'orderSearch' | 'deletePackage';

const ADMIN_VIEWS: readonly AdminView[] = ['overview', 'orders', 'delivery', 'packages', 'couriers', 'customers', 'cities', 'schedule', 'weightTiers', 'bankAccounts', 'partners', 'tenants', 'tenantSettlements', 'history', 'returnExchange', 'finance', 'operators', 'homepage', 'orderSearch', 'deletePackage'];

// Views an Operator (partial-admin role) may open. Operators now have full admin-level
// access to these pages (create/edit/assign/etc.); only company revenue/margin figures
// stay hidden (stripped server-side + revenue columns hidden via canSeeRevenue below).
// Still Admin-only: Finance, Operators management, Partner API, Weight Tiers, Tenants.
const OPERATOR_VIEWS: readonly AdminView[] = ['overview', 'orders', 'delivery', 'packages', 'couriers', 'customers', 'cities', 'schedule', 'history', 'returnExchange', 'orderSearch'];

// Views a tenant co-admin (TenantAdmin) may open — all scoped to their tenant. Pick-Up is
// accept-only and Delivery is read-only (both via canManage=false); Finance renders the
// dedicated tenant components, not the company-wide AdminFinancePage.
const TENANT_VIEWS: readonly AdminView[] = ['orders', 'delivery', 'packages', 'customers', 'finance', 'homepage'];

export function AdminDashboard() {
  const { user, signOut, token } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const tabParam    = searchParams.get('tab') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const viewParam   = searchParams.get('view') ?? '';
  // Deep-link search term (from the global Order Search "Go To"): seeds the destination
  // page's search box so it lands on that exact order.
  const qParam      = searchParams.get('q') ?? '';
  // The sender/recipient scope chosen on Order Search — seeds the destination's own
  // search-party toggle so it matches what was searched.
  const partyParam  = searchParams.get('party') === 'recipient' ? 'recipient' : 'sender';

  // Operators are a partial-admin role: same dashboard, restricted to Overview + Pick-Up.
  const isOperator = user?.role === 'Operator';
  // Tenant co-admins reuse this dashboard too, scoped to their tenant (see TENANT_VIEWS).
  const isTenant = user?.role === 'TenantAdmin';
  // Only the dedicated 'systemadmin' account may create/edit white-label tenants.
  const isSystemAdmin = !!user?.isSystemAdmin;

  // Seed the active view from the URL so a page refresh stays on the current page.
  const [sidebarView, setSidebarView] = useState<AdminView>(
    (ADMIN_VIEWS as readonly string[]).includes(viewParam) ? (viewParam as AdminView) : 'overview'
  );
  const requestedView: AdminView = tabParam === 'orders' ? 'orders' : sidebarView;
  // Clamp Operators to their allowed views even if they hand-edit the URL.
  const activeView: AdminView =
    isTenant   && !TENANT_VIEWS.includes(requestedView)   ? 'orders'
    : isOperator && !OPERATOR_VIEWS.includes(requestedView) ? 'overview'
    // Block a non-systemadmin Admin from landing on the Tenants/Partner API/Tenant
    // Settlements pages via the URL.
    : (requestedView === 'tenants' || requestedView === 'partners' || requestedView === 'tenantSettlements') && !isSystemAdmin ? 'overview'
    // Global Order Search is Admin/Operator (tenants are clamped out).
    : requestedView === 'orderSearch' && isTenant ? 'overview'
    : requestedView;

  const goTo = (view: AdminView) => {
    // Persist the view in the URL (replace, no history spam) so refresh restores it.
    navigate(view === 'overview' ? '/admin' : `/admin?view=${view}`, { replace: true });
    setSidebarView(view);
    setMobileMenuOpen(false); // close the mobile drawer after navigating (no-op on desktop)
  };

  // Jump from the global Order Search to the page an order lives on, seeding that page's
  // search box with the tracking number so it lands on exactly that order.
  const goToOrder = (view: AdminView, trackingNumber: string, party: 'sender' | 'recipient' = 'sender') => {
    navigate(`/admin?view=${view}&q=${encodeURIComponent(trackingNumber)}&party=${party}`, { replace: true });
    setSidebarView(view);
  };

  const [showCreateCourier, setShowCreateCourier] = useState(false);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [editCourier, setEditCourier] = useState<Courier | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Mobile drawer (the desktop sidebar is hidden below 768px — see dashboard.css).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live return/exchange badge count (SignalR) — shared with the staff nav.
  const { returnExchange: returnExchangeCount } = useAdminPendingCounts(token ?? null, !isOperator);

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

  const handleCourierUpdated = (courierId: string, newFirstName: string, newLastName: string, newUsername: string, newPhone: string, newIdNumber: string, newDefaultSalary: number | null) => {
    setCouriers(prev => prev.map(c =>
      c.courierId === courierId
        ? { ...c, firstName: newFirstName, lastName: newLastName, fullName: `${newFirstName} ${newLastName}`, username: newUsername, phoneNumber: newPhone, idNumber: newIdNumber, defaultSalary: newDefaultSalary }
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
      {/* Backdrop for the mobile drawer (only visible < 768px when open). */}
      {mobileMenuOpen && (
        <div className="sidebar-mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
      <aside className={`sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}${mobileMenuOpen ? ' sidebar--mobile-open' : ''}`}>
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
        <span className="sidebar__role-badge">{isTenant ? 'Tenant' : isOperator ? 'Operator' : 'Admin'}</span>
        <div className="sidebar__divider" />
        <p className="sidebar__section-label">{t.sidebarManagement}</p>
        <nav className="sidebar__nav">
          {isTenant && (
          <button className={`sidebar__link ${activeView === 'homepage' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('homepage')} title="Homepage">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 7l6-5 6 5v7H2V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M6.5 14V9.5h3V14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <span className="sidebar__link-text">Homepage</span>
          </button>
          )}
          {!isTenant && (
          <button className={`sidebar__link ${activeView === 'overview' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('overview')} title={t.sidebarOverview}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarOverview}</span>
          </button>
          )}
          <button className={`sidebar__link ${activeView === 'orders' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('orders')} title={t.navPickUp}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 5.5h7M4.5 8h5M4.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.navPickUp}</span>
          </button>
          {/* Delivery page: Operators get a read-only view (see canManage on AdminOrdersPage). */}
          <button className={`sidebar__link ${activeView === 'delivery' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('delivery')} title={t.navDelivery}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M1 8h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.navDelivery}</span>
          </button>
          {/* Packages page: merges Pick-Up + Delivery into a single last-mile list. */}
          <button className={`sidebar__link ${activeView === 'packages' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('packages')} title={t.topbarPackages}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 5l6-3 6 3v6l-6 3-6-3V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M2 5l6 3 6-3M8 8v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sidebar__link-text">{t.topbarPackages}</span>
          </button>
          {/* Couriers — Admin + Operator (full management). */}
          {!isTenant && (
          <button className={`sidebar__link ${activeView === 'couriers' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('couriers')} title={t.sidebarCouriers}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarCouriers}</span>
            {couriers.length > 0 && <span className="sidebar__badge sidebar__badge--count">{couriers.length}</span>}
          </button>
          )}
          {/* Customers — Admin + Operator + Tenant co-admin. */}
          <button className={`sidebar__link ${activeView === 'customers' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('customers')} title={t.sidebarCustomers}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1 14c0-2.5 2-4 4.5-4M8 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarCustomers}</span>
          </button>
          {/* Cities — Admin + Operator. */}
          {!isTenant && (
          <button className={`sidebar__link ${activeView === 'cities' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('cities')} title={t.sidebarCities}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="7" width="14" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M8 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarCities}</span>
          </button>
          )}
          {/* Schedule — Admin + Operator. */}
          {!isTenant && (
          <button className={`sidebar__link ${activeView === 'schedule' ? 'sidebar__link--active' : ''}`} onClick={() => goTo('schedule')} title={t.navSchedule}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1.5 6h13" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 1.2v2.6M11.5 1.2v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="sidebar__link-text">{t.navSchedule}</span>
          </button>
          )}
          {/* Pricing / integrations / tenancy — Admin only. */}
          {!isOperator && !isTenant && (<>
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
            className={`sidebar__link ${activeView === 'bankAccounts' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('bankAccounts')}
            title={t.sidebarBankAccounts}
          >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 6.5L8 2l6.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2.5" y="6.5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2 13.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="sidebar__link-text">{t.sidebarBankAccounts}</span>
          </button>
          {isSystemAdmin && (<>
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
            className={`sidebar__link ${activeView === 'tenants' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('tenants')}
            title="Tenants"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 14V6l6-4 6 4v8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <span className="sidebar__link-text">Tenants</span>
          </button>
          <button
            className={`sidebar__link ${activeView === 'tenantSettlements' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('tenantSettlements')}
            title="Tenant Settlements"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="sidebar__link-text">Tenant Settlements</span>
          </button>
          </>)}
          </>)}
          {/* History — Admin + Operator. */}
          {!isTenant && (
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
          )}
          {/* Return & Exchange — available to Admins and Operators (not tenants). */}
          {!isTenant && (
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
          )}
          {/* Global Order Search — Admin + Operator (search any order across every page). */}
          {!isTenant && (
          <button
            className={`sidebar__link ${activeView === 'orderSearch' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('orderSearch')}
            title={t.osTitle}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span className="sidebar__link-text">{t.osTitle}</span>
          </button>
          )}
          {/* Delete Package — Admin only. Permanent (soft) delete of a package or batch. */}
          {!isOperator && !isTenant && (
          <button
            className={`sidebar__link ${activeView === 'deletePackage' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('deletePackage')}
            title={t.navDeletePackage}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L13 4M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="sidebar__link-text">{t.navDeletePackage}</span>
          </button>
          )}
          {/* Finance — Admin + Tenant co-admin; company P&L stays hidden from operators. */}
          {!isOperator && (
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
          )}
          {/* Operators management — Admin only. */}
          {!isOperator && !isTenant && (
          <button
            className={`sidebar__link ${activeView === 'operators' ? 'sidebar__link--active' : ''}`}
            onClick={() => goTo('operators')}
            title={t.sidebarOperators}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M3 14c0-2.8 2.2-4.4 5-4.4s5 1.6 5 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M12.5 3.5l1 1 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sidebar__link-text">{t.sidebarOperators}</span>
          </button>
          )}
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
        {/* Mobile topbar (hidden on desktop) — hosts the hamburger that opens the drawer. */}
        <div className="cust-mobile-topbar">
          <div className="cust-mobile-topbar__left">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="6" fill="currentColor" />
              <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="cust-mobile-topbar__brand">{t.appName}</span>
            <span className="cust-role-badge-sm">{isTenant ? 'Tenant' : isOperator ? 'Operator' : 'Admin'}</span>
          </div>
          <div className="cust-mobile-topbar__right">
            <button
              className="cust-hamburger"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t.custMenu}
            </button>
          </div>
        </div>
        <div className="dashboard__topbar">
          <span className="dashboard__topbar-title">
            {activeView === 'overview'  && t.topbarOverview}
            {activeView === 'orders'    && t.navPickUp}
            {activeView === 'delivery'  && t.navDelivery}
            {activeView === 'packages' && t.topbarPackages}
            {activeView === 'couriers'  && t.topbarCouriers}
            {activeView === 'customers' && t.topbarCustomers}
            {activeView === 'cities' && t.topbarCities}
            {activeView === 'schedule' && t.navSchedule}
            {activeView === 'weightTiers' && t.topbarWeightTiers}
            {activeView === 'bankAccounts' && t.topbarBankAccounts}
            {activeView === 'partners' && 'Partner API'}
            {activeView === 'tenants' && 'Tenants'}
            {activeView === 'tenantSettlements' && 'Tenant Settlements'}
            {activeView === 'history' && t.topbarHistory}
            {activeView === 'returnExchange' && t.navReturnExchange}
            {activeView === 'finance' && t.navFinance}
            {activeView === 'homepage' && 'Homepage'}
            {activeView === 'operators' && t.topbarOperators}
            {activeView === 'orderSearch' && t.osTitle}
            {activeView === 'deletePackage' && t.navDeletePackage}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Persistent office "Add Package" — Admin/Operator, from any view. */}
            {!isTenant && (
              <button className="btn-primary" onClick={() => setShowAddPackage(true)}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {t.addPackage}
              </button>
            )}
            {activeView === 'couriers' && (
              <button className="btn-primary" onClick={() => setShowCreateCourier(true)}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {t.addCourier}
              </button>
            )}
          </div>
        </div>
        <main className="dashboard__content">
          {activeView === 'overview'  && <AdminOverview token={token ?? ''} isOperator={isOperator} />}
          {/* Pick-Up: tenant co-admin is accept-only and can't assign couriers. Operators now manage fully. */}
          {activeView === 'orders'    && <AdminOrders key={statusParam} initialStatus={statusParam} canManage={!isTenant} canAssignCourier={!isTenant} canGroup={!isTenant} canSeeRevenue={!isOperator} />}
          {activeView === 'operators' && !isOperator && !isTenant && <AdminOperatorsPage token={token ?? ''} />}
          {/* Delivery: read-only for tenant co-admins; operators manage fully but never see company revenue. */}
          {activeView === 'delivery'  && <AdminOrdersPage token={token ?? ''} canManage={!isTenant} canSeeRevenue={!isOperator} />}
          {/* Packages: merged Pick-Up + Delivery list. Mirrors the same canManage/canAssignCourier gates. */}
          {activeView === 'packages' && <AdminPackagesPage key={`pkg-${qParam}`} canManage={!isTenant} canAssignCourier={!isTenant} canGroup={!isTenant} canSeeRevenue={!isOperator} initialSearch={qParam} initialParty={partyParam} />}
          {activeView === 'couriers'  && <AdminCouriers couriers={couriers} token={token ?? ''} canSeeRevenue={!isOperator} onAdd={() => setShowCreateCourier(true)} onEdit={setEditCourier} onActiveChanged={handleCourierActiveChanged} />}
          {/* Customers: tenant co-admin can view/create/edit, but not set company prices. */}
          {activeView === 'customers' && <AdminCustomersPage token={token ?? ''} canManage={!isTenant} />}
                  {activeView === 'cities' && <AdminCitiesPage token={token ?? ''} />}
                  {activeView === 'schedule' && <AdminSchedulePage token={token ?? ''} />}
                  {activeView === 'weightTiers' && token && (
                      <AdminWeightPriceTiersPage token={token} />
                  )}
                  {activeView === 'bankAccounts' && !isOperator && !isTenant && token && (
                      <AdminBankAccountsPage token={token} />
                  )}
          {activeView === 'partners' && isSystemAdmin && token && <AdminPartnersPage token={token} />}
          {activeView === 'tenants' && isSystemAdmin && token && <AdminTenantsPage token={token} />}
          {activeView === 'tenantSettlements' && isSystemAdmin && token && <AdminTenantSettlementsPage token={token} />}
          {activeView === 'history' && <AdminHistoryPage key={`hist-${qParam}`} token={token ?? ''} canSeeRevenue={!isOperator} initialSearch={qParam} initialParty={partyParam} />}
          {activeView === 'orderSearch' && !isTenant && token && (
            <AdminOrderSearchPage token={token} onGoTo={goToOrder} />
          )}
          {activeView === 'deletePackage' && !isOperator && !isTenant && token && (
            <AdminDeletePackagePage token={token} />
          )}
          {/* Finance: tenant co-admin sees the scoped tenant finance, never the company-wide P&L. */}
          {activeView === 'finance' && (isTenant ? <TenantFinanceView /> : <AdminFinancePage token={token ?? ''} />)}
          {/* Homepage: tenant co-admin edits their own white-label storefront. */}
          {activeView === 'homepage' && isTenant && <TenantHomepageEditor />}
          {activeView === 'returnExchange' && token && (
            <AdminReturnExchangePage
              key={`re-${qParam}`}
              token={token}
              couriers={couriers}
              onBack={() => goTo('overview')}
              initialSearch={qParam}
              initialParty={partyParam}
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

      <AddPackageModal
        key={showAddPackage ? 'ap-open' : 'ap-closed'}
        open={showAddPackage}
        onClose={() => setShowAddPackage(false)}
        onCreated={(result) => {
          setShowAddPackage(false);
          const n = result.orders.length;
          setToast(`${t.apCreatedToast} (${n})`);
          setTimeout(() => setToast(null), 4000);
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
        }}
      />

      <EditCourierModal
        key={editCourier?.courierId ?? 'none'}
        open={editCourier !== null}
        courier={editCourier}
        token={token ?? ''}
        onClose={() => setEditCourier(null)}
        onUpdated={(id, firstName, lastName, username, phone, idNumber, defaultSalary) => { handleCourierUpdated(id, firstName, lastName, username, phone, idNumber, defaultSalary); }}
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
        .dmp-search { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text-subtle); }
        .dmp-search-input { flex: 1; background: none; border: none; outline: none; color: var(--color-text); font-size: 0.82rem; }
        .dmp-search-input::placeholder { color: var(--color-text-subtle); }
        .dmp-empty { padding: 12px 10px; text-align: center; font-size: 0.78rem; color: var(--color-text-subtle); }
        .dmp-tick { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; border-radius: 100px; border: 1px solid var(--color-border); background: none; color: transparent; cursor: pointer; transition: all var(--transition); }
        .dmp-tick:hover { border-color: var(--color-accent); }
        .dmp-tick--on { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }
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
        .go-select-wrap { position: relative; display: flex; align-items: center; min-width: 0; max-width: 100%; }
        .go-select-icon { position: absolute; left: 10px; color: var(--color-text-subtle); pointer-events: none; flex-shrink: 0; }
        .go-select-chevron { position: absolute; right: 9px; color: var(--color-text-subtle); pointer-events: none; }
        /* A native <select> with no explicit width sizes itself to its longest
           <option> text (e.g. a long customer/business name) — without a cap it
           pushes past the row and off the screen on mobile. Cap + truncate it. */
        .go-select { appearance: none; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.825rem; padding: 8px 30px 8px 30px; cursor: pointer; min-width: 140px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: border-color var(--transition); outline: none; }
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
        /* flex-wrap: see .go-details-scroll below for why this matters even on desktop. */
        .go-row-header { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 20px; cursor: pointer; transition: background var(--transition); user-select: none; }
        .go-row-header:hover { background: var(--color-bg-3); }
        .go-chevron { color: var(--color-text-subtle); flex-shrink: 0; transition: transform 0.18s ease; }
        .go-chevron--open { transform: rotate(90deg); }

        /* Customer/sender details laid out as fixed, labeled columns so each field
           (store, phone, pickup location, status, packages, date) always sits in the
           same place. flex-basis is 660px (not "auto") so the .go-row-header wrap above
           sees this column's real preferred width and drops .go-actions to its own line
           once a batch's action buttons (e.g. AcceptedGroupOrder: assign courier + set
           date + revert + force-warehouse + cancel) would otherwise out-width it — without
           an explicit basis the browser never wraps and instead shrinks this via
           min-width:0 down to a near-zero-width scrollbar, hiding sender/phone/status.
           On very narrow screens, once wrapped onto its own line, it can still be less
           than 660px and scrolls internally — the chevron and action buttons stay fixed
           and reachable either way. */
        .go-details-scroll { flex: 1 1 660px; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
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
        .go-action-btn--revert    { background: #f59e0b; color: #fff; }
        .go-action-hint { font-size: 0.72rem; color: var(--color-text-subtle); font-style: italic; }
        .go-courier-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .go-select--inline { min-width: 200px; padding: 6px 28px 6px 10px; font-size: 0.8rem; }
        .action-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 9px; background: var(--color-text); color: var(--color-bg); border-radius: var(--radius-md); padding: 12px 20px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2); animation: toast-in 0.25s ease both; white-space: nowrap; }
        .action-toast--err { background: #ef4444; color: #fff; }

        /* Pick-Up day navigator */
        .pickup-daynav { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
        /* When wrapped alongside the grouped/ungrouped mode toggle, the wrapper owns the
           bar padding + underline so it spans the full width (incl. the mode toggle). */
        .pickup-daynav-wrap { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
        .pickup-daynav-wrap .pickup-daynav { padding: 0; border-bottom: none; flex-wrap: nowrap; }
        .pickup-daynav__arrow { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); cursor: pointer; transition: all var(--transition); }
        .pickup-daynav__arrow:hover:not(:disabled) { background: var(--color-bg-3); border-color: var(--color-text-subtle); }
        .pickup-daynav__arrow:disabled { opacity: 0.4; cursor: not-allowed; }
        .pickup-daynav__date { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.9rem; font-weight: 700; padding: 5px 8px; outline: none; font-family: inherit; }
        .pickup-daynav__label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.92rem; font-weight: 700; color: var(--color-text); }
        .pickup-daynav__today { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-accent); background: var(--color-accent-dim); border-radius: 100px; padding: 2px 8px; }
        .pickup-daynav__jump { margin-left: 4px; background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.76rem; font-weight: 600; padding: 6px 12px; cursor: pointer; transition: all var(--transition); }
        .pickup-daynav__jump:hover { background: var(--color-bg-3); color: var(--color-text); }
        .pickup-pagination { display: flex; align-items: center; gap: 14px; justify-content: center; padding: 16px 20px; border-top: 1px solid var(--color-border); }
        .pickup-page-btn { background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.82rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: background var(--transition); }
        .pickup-page-btn:hover:not(:disabled) { background: var(--color-bg-2); }
        .pickup-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pickup-page-info { font-size: 0.82rem; color: var(--color-text-subtle); }
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

        /* ── Mobile (≤768px) ── */
        @media (max-width: 768px) {
          /* Tables keep a readable width and scroll inside their .table-scroll wrapper
             instead of crushing columns to fit the phone width. */
          .courier-table { min-width: 620px; }
          /* Tighter horizontal padding so rows/toolbars use the narrow width well
             (flex-wrap is already on .go-row-header at every width, see above). */
          .go-row-header { gap: 10px; padding: 12px 14px; }
          .go-toolbar, .go-status-bar { padding: 10px 14px; }
          .pickup-daynav, .pickup-daynav-wrap, .pickup-controls, .pickup-summary { padding-left: 14px; padding-right: 14px; }
          /* The desktop nowrap override (so the day-nav sits on one line beside the
             mode toggle) doesn't fit the arrows + two date inputs + jump button at
             phone width — let it wrap again instead of spilling off the right edge. */
          .pickup-daynav-wrap .pickup-daynav { flex-wrap: wrap; }
          .pickup-daynav__label { flex-wrap: wrap; row-gap: 4px; }
          .go-note { padding-left: 14px; padding-right: 14px; }
          /* The day navigator's "mode" toggle shouldn't get shoved off-screen. */
          .pickup-modes { margin-left: 0; }
          /* Give the search box the full row on phones. */
          .go-search { max-width: none; flex-basis: 100%; }
          /* Full-width action buttons wrap cleanly and stay tappable. */
          .go-actions { width: 100%; margin-left: 0; }
          .pickup-modal__footer { flex-wrap: wrap; }
        }
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

const ADMIN_OVERVIEW_QUERY_KEY = (isOperator: boolean) => ['admin', 'overview', isOperator] as const;

function AdminOverview({ token, isOperator = false }: { token: string; isOperator?: boolean }) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const { data, isLoading: loading } = useQuery({
        queryKey: ADMIN_OVERVIEW_QUERY_KEY(isOperator),
        queryFn: () => Promise.all([
            fetchGroupOrders(token, { pageSize: 1000 }).then(r => r.items).catch(() => [] as AdminGroupOrder[]),
            // Operators have no access to courier/SMS data — skip those fetches.
            isOperator ? Promise.resolve([] as Courier[]) : fetchCouriers(token).catch(() => [] as Courier[]),
            isOperator ? Promise.resolve(null as number | null) : fetchSmsBalance(token).catch(() => null as number | null),
        ]).then(([groupOrders, couriers, smsBalance]) => ({ groupOrders, couriers, smsBalance })),
        enabled: !!token,
    });
    const groupOrders = data?.groupOrders ?? [];
    const couriers = data?.couriers ?? [];
    const smsBalance = data?.smsBalance ?? null;

    // Live refresh: when any order is placed/changed, silently revalidate this cached
    // data in the background instead of forcing a full reload/spinner.
    useOrdersChangedSignal(token ?? null, 'adminOrdersChanged', () => {
        void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY(isOperator) });
    });

    const totalOrders = groupOrders.reduce((sum, go) => sum + go.orders.length, 0);
    const pendingPickup = groupOrders.filter(go =>
        go.status === 'Pending' || go.status === 'AcceptedGroupOrder' ||
        go.status === 'CourierAssignedToPickUp'
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

    const stats: { label: string; value: string; sub: string; low?: boolean }[] = [
        { label: t.overviewTotalOrders ?? 'Total Orders', value: loading ? '…' : String(totalOrders), sub: t.overviewAllTime ?? 'All time' },
        { label: t.overviewPendingPickup ?? 'Pending Pickup', value: loading ? '…' : String(pendingPickup), sub: t.overviewAwaitingCourier ?? 'Awaiting courier' },
        { label: t.overviewInTransit ?? 'In Transit', value: loading ? '…' : String(inTransit), sub: t.overviewActiveDeliveries ?? 'Active deliveries' },
        // Courier roster + SMS credits are admin-only; operators don't see them.
        ...(isOperator ? [] : [
            { label: t.overviewActiveCouriers ?? 'Active Couriers', value: loading ? '…' : String(activeCouriers), sub: t.overviewAvailableNow ?? 'Available now' },
            {
                label: 'SMS Credits',
                value: smsBalanceDisplay,
                sub: smsLow ? '⚠️ Low balance' : 'UBill balance',
                low: smsLow,
            },
        ]),
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
                    <div className="table-scroll">
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
                    </div>
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

const PICKUP_PAGE_SIZE = 30;

function AdminOrders({ initialStatus = '', canManage = true, canAssignCourier = canManage, canGroup = canManage, canSeeRevenue = true }: { initialStatus?: string; canManage?: boolean; canAssignCourier?: boolean; canGroup?: boolean; canSeeRevenue?: boolean }) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const [page,        setPage]          = useState(1);
  const [search,      setSearch]        = useState('');
  // The list is refetched 350ms after the admin stops typing; other filters (dropdowns,
  // date picker) apply immediately since they don't need keystroke debouncing.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const [filterParty,    setFilterParty]    = useState<'sender' | 'recipient'>('sender');
  const [filterCity,     setFilterCity]     = useState('');
  const [filterDistricts,setFilterDistricts] = useState<string[]>([]);
  const [filterStatus,   setFilterStatus]   = useState(initialStatus);
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [actionToast,    setActionToast]    = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  // Warehouse acceptance: per-package "arrived" ticks keyed by order id. A package NOT in
  // this set is present (default ticked); ids here were unticked = missing, so they get
  // cancelled as "not received" when the batch is accepted in warehouse.
  const [absentPkgs, setAbsentPkgs] = useState<Set<string>>(() => new Set());
  const togglePkgPresent = (orderId: string) => setAbsentPkgs(prev => {
    const next = new Set(prev);
    if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
    return next;
  });
  // Order being edited from a group order's package row, with its customer's pricing.
  const [editing, setEditing] = useState<{ item: AdminOrderItem; pricing: CustomerServicePricing | null } | null>(null);

  // ── Pick-Up day navigation + grouping ──────────────────────────────────────
  // null = untouched/Show-All depending on dateTouched (see resolveDateWindow); a date
  // filters the list to that single day, and an optional rangeEnd widens it to an
  // inclusive [selectedDate..rangeEnd] span.
  const [selectedDate,     setSelectedDate]     = useState<Date | null>(null);
  const [rangeEnd,         setRangeEnd]         = useState<Date | null>(null);
  // False until the admin interacts with the day/range navigator at all (including
  // "Show All"/"Today"). Untouched + no search → default to a rolling last-7-days window.
  const [dateTouched,      setDateTouched]      = useState(false);
  const [groupingCustomer, setGroupingCustomer] = useState<PickupDayCustomer | null>(null);
  // The day grouping/merge actions operate on. Falls back to today while showing All,
  // so the per-day Non-Grouped tools still work without a day chosen.
  const [groupingDate,     setGroupingDate]     = useState<Date>(() => georgianToday());
  // Standalone order the admin is accepting — drives the "choose batch, then accept" dialog.
  const [acceptStandalone, setAcceptStandalone] = useState<AdminGroupOrder | null>(null);
  const [acceptTargetId,   setAcceptTargetId]   = useState<string>(''); // '' = create a new batch
  const [acceptBusy,       setAcceptBusy]       = useState(false);
  // Standalone order the admin is warehousing — group + pickup courier + mark in warehouse.
  const [whStandalone,     setWhStandalone]     = useState<AdminGroupOrder | null>(null);
  const [whTargetId,       setWhTargetId]       = useState<string>(''); // '' = create a new batch
  const [whCourierId,      setWhCourierId]      = useState<string>('');
  const [whBusy,           setWhBusy]           = useState(false);
  // Grouping/merge stay anchored to a single day (the "from" day, else today); the
  // optional range only widens which batches the list shows.
  const effectiveDay    = selectedDate ?? georgianToday();
  const effectiveDayKey = toDateKey(effectiveDay);
  const [mergingCustomer, setMergingCustomer] = useState<{ name: string; batches: AdminGroupOrder[] } | null>(null);
  // Grouped (batches) vs Non-grouped (customers with un-grouped orders) view.
  const [pickupMode,      setPickupMode]      = useState<'grouped' | 'ungrouped'>('grouped');
  const [customerFilter,  setCustomerFilter]  = useState<string>('');   // '' = all customers
  // Non-grouped view: optional customer narrowing among customers with 2+ batches.
  const [ungroupedCustomerFilter, setUngroupedCustomerFilter] = useState<string>('');

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
      groupOrderId: go.id,
      pickUpCity: go.pickUpCity,
      pickUpDistrict: go.pickUpDistrict,
      pickUpAddress: go.pickUpAddress,
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
      postponeComment: null,
    };
    setEditing({
      item,
      pricing: {
        capital:  go.companyServiceCapitalPrice,
        city:     go.companyServiceCityPrice,
        district: go.companyServiceDistrictPrice,
        specialPrices: go.customerSpecialPrices,
      },
    });
  };

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setActionToast({ msg, type });
    setTimeout(() => setActionToast(null), 4000);
  };

  // Untouched day navigator + no search → rolling last-7-days default; an explicit
  // day/range pick or a search term reaches the whole DB.
  const { date: windowDate, dateTo: windowDateTo } = resolveDateWindow({ dateTouched, search: debouncedSearch, selectedDate, rangeEnd });

  const pickupFilters = {
    search: debouncedSearch || undefined,
    date: windowDate, dateTo: windowDateTo,
    cities: filterCity ? [filterCity] : undefined,
    districts: filterDistricts.length > 0 ? filterDistricts : undefined,
    party: filterParty,
    status: filterStatus || undefined,
    excludeCompleted: true,
  };

  // Reset to page 1 whenever a filter changes — a stale page number past the end of a
  // narrower result set would otherwise render an empty list until manually paged back.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterCity, filterDistricts, filterParty, filterStatus, windowDate, windowDateTo]);

  const mainQuery = useQuery({
    queryKey: ['admin', 'pickup', 'list', pickupFilters, page] as const,
    queryFn: () => fetchGroupOrders(token ?? '', { ...pickupFilters, page, pageSize: PICKUP_PAGE_SIZE }),
    enabled: !!token,
    // Keep the previous page's rows on screen while the next page/filter loads instead
    // of flashing an empty list — the defining UX this migration was meant to fix.
    placeholderData: keepPreviousData,
  });
  const groupOrders = mainQuery.data?.items ?? [];
  const totalCount  = mainQuery.data?.totalCount ?? 0;
  const loading     = mainQuery.isPending;
  const error       = mainQuery.isError ? (mainQuery.error instanceof Error ? mainQuery.error.message : t.goLoadingOrders) : null;

  // The Non-Grouped tools are per-day; summarize the effective day (the chosen day,
  // or today while showing All) so they keep working without a day filter.
  const summaryQuery = useQuery({
    queryKey: ['admin', 'pickup', 'summary', effectiveDayKey] as const,
    queryFn: () => fetchPickupDay(token ?? '', effectiveDayKey),
    enabled: !!token,
  });
  const daySummary = summaryQuery.data ?? [];

  // Every batch/standalone order matching the current filters + date window (not just the
  // current ~30-row page of `groupOrders`) — decoupled from the paginated main list so the
  // merge/grouping tools below always see every batch for whatever day they operate on
  // (the selected day, or the day of any order actually visible in the list), regardless
  // of which page of the main feed it would otherwise land on. A generous pageSize instead
  // of paginating — a batch count within one browsing window is realistically small.
  const windowScopedQuery = useQuery({
    queryKey: ['admin', 'pickup', 'windowScoped', pickupFilters] as const,
    queryFn: () => fetchGroupOrders(token ?? '', { ...pickupFilters, page: 1, pageSize: 500 }).then(r => r.items),
    enabled: !!token,
    placeholderData: keepPreviousData,
  });
  const windowScopedOrders = windowScopedQuery.data ?? [];

  const couriersQuery = useQuery({
    queryKey: ['admin', 'couriers'] as const,
    queryFn: () => fetchCouriers(token ?? ''),
    enabled: !!token,
  });
  const couriers = couriersQuery.data ?? [];

  // Refresh helpers kept under their original names — every mutation handler below
  // (accept/decline/assign/group/etc.) already calls these to refresh after an action.
  const load = useCallback((pageArg?: number) => {
    if (pageArg !== undefined && pageArg !== page) { setPage(pageArg); return; }
    void mainQuery.refetch();
  }, [page, mainQuery]);
  const loadSummary = useCallback(() => { void summaryQuery.refetch(); }, [summaryQuery]);
  const loadWindowScoped = useCallback(() => { void windowScopedQuery.refetch(); }, [windowScopedQuery]);

  // Live refresh: when any order is placed/changed, refetch silently (keep current
  // filters/page, no spinner) so new customer orders appear without a manual refresh.
  useOrdersChangedSignal(token ?? null, 'adminOrdersChanged', () => { void load(page); void loadSummary(); void loadWindowScoped(); });

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

  // When a day is chosen, show that day's batches; an optional rangeEnd widens it to the
  // inclusive [from..to] span; otherwise (All) show every day. Date keys are 'yyyy-MM-dd',
  // so lexical string comparison is chronological.
  const dayKey   = selectedDate ? toDateKey(selectedDate) : null;
  const dayKeyTo = rangeEnd ? toDateKey(rangeEnd) : dayKey;
  const dayOrders = useMemo(
    () => (dayKey
      ? visibleOrders.filter(go => { const k = georgianDateKeyOf(go.createdAt); return k >= dayKey && k <= dayKeyTo!; })
      : visibleOrders),
    [visibleOrders, dayKey, dayKeyTo],
  );

  // The still-open batches each customer has that day — drives the Merge chooser.
  // Reads windowScopedOrders (not the paginated groupOrders) so every batch for the day is
  // considered regardless of which page of the main list it would otherwise land on.
  const mergeableByCustomer = useMemo(() => {
    const m = new Map<string, AdminGroupOrder[]>();
    for (const go of windowScopedOrders) {
      if (go.isStandalone) continue;            // not a real batch — can't merge
      if (!go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== effectiveDayKey) continue;
      if (!MERGEABLE_STATUSES.has(go.status)) continue;
      const arr = m.get(go.customerId);
      if (arr) arr.push(go); else m.set(go.customerId, [go]);
    }
    // Earliest first, so the chooser defaults the target to the first batch.
    for (const arr of m.values())
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return m;
  }, [windowScopedOrders, effectiveDayKey]);

  // Appendable real batches for a customer on a specific Georgian day. Used when grouping
  // a standalone order so its target batches match the order's own day — correct even in
  // All mode, where cards from several days are shown together.
  const batchesFor = useCallback((customerId: string, dKey: string) =>
    windowScopedOrders
      .filter(b => !b.isStandalone && b.customerId === customerId
        && georgianDateKeyOf(b.createdAt) === dKey && MERGEABLE_STATUSES.has(b.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  [windowScopedOrders]);

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

  // Non-grouped view = customers who placed 2+ separate group orders on the selected
  // day, counted regardless of each batch's status or package count.
  const multiBatchCustomers = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const go of windowScopedOrders) {
      if (go.isStandalone) continue;            // standalone singles aren't batches
      if (!go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== effectiveDayKey) continue;
      const e = counts.get(go.customerId);
      if (e) e.n += 1; else counts.set(go.customerId, { name: go.senderBusinessName, n: 1 });
    }
    return [...counts.entries()]
      .filter(([, v]) => v.n >= 2)
      .map(([id, v]) => ({ id, name: v.name, count: v.n }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [windowScopedOrders, effectiveDayKey]);

  // Customers surfaced in the Non-grouped view: those with 2+ batches that day
  // (mergeable) AND those with standalone orders not yet attached to any batch
  // (groupable, GroupOrderId == null). Without the latter a customer whose only
  // orders are standalone would never be selectable here — and so never groupable.
  // For the count badge prefer the loose-order count when present, since that's the
  // figure the "Group orders" action acts on.
  const ungroupedCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const c of multiBatchCustomers) map.set(c.id, { id: c.id, name: c.name, count: c.count });
    for (const s of daySummary) {
      if (s.unattachedOrders <= 0) continue;
      const existing = map.get(s.customerId);
      if (existing) existing.count = s.unattachedOrders;
      else map.set(s.customerId, { id: s.customerId, name: s.businessName, count: s.unattachedOrders });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [multiBatchCustomers, daySummary]);

  // The batches shown in the Non-grouped list: every batch belonging to a surfaced
  // customer that day, optionally narrowed to one customer, same-customer batches grouped.
  // (Standalone, un-batched orders have no batch to draw here — they are grouped via the
  // per-customer "Group orders" action, which lists them in a modal.)
  const ungroupedListOrders = useMemo(() => {
    const ids = new Set(ungroupedCustomers.map(c => c.id));
    return windowScopedOrders
      .filter(go => !!go.customerId
                 && ids.has(go.customerId)
                 && georgianDateKeyOf(go.createdAt) === effectiveDayKey
                 && (!ungroupedCustomerFilter || go.customerId === ungroupedCustomerFilter))
      .sort((a, b) =>
        a.customerId !== b.customerId
          ? a.senderBusinessName.localeCompare(b.senderBusinessName)
          : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [windowScopedOrders, effectiveDayKey, ungroupedCustomers, ungroupedCustomerFilter]);

  // The list the shared batch renderer draws, depending on the active toggle.
  const displayList = pickupMode === 'ungrouped' ? ungroupedListOrders : listOrders;

  const hasLocationFilter = filterCity || filterDistricts.length > 0;
  const hasFilters        = search || hasLocationFilter || filterStatus;
  const clearAll          = () => { setSearch(''); setFilterCity(''); setFilterDistricts([]); setFilterStatus(''); };

  // Returns only the orders that match the active recipient city/district filter
  // AND are not in a terminal status (delivered/cancelled orders shown in History only).
  const visibleOrdersFor = useCallback((go: AdminGroupOrder) => {
    const orders = go.orders.filter(o => !ACTIVE_ORDER_STATUSES_ONLY.has(o.status));
    // The Non-grouped view has no location filter — always show every active package.
    if (pickupMode === 'ungrouped' || filterParty !== 'recipient' || (!filterCity && filterDistricts.length === 0)) return orders;
    return orders.filter(o => {
      if (filterCity                && o.recipientCity     !== filterCity)     return false;
      if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
      return true;
    });
  }, [pickupMode, filterParty, filterCity, filterDistricts]);

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
      {/* Day navigator — All, a single day, or a custom inclusive range */}
      <div className="pickup-daynav-wrap">
        <DateRangeNav
          from={selectedDate}
          to={rangeEnd}
          onChange={(f, to) => { setDateTouched(true); setSelectedDate(f); setRangeEnd(to); }}
          classPrefix="pickup-daynav"
        />
        {(canManage || canGroup) && (
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
        )}
      </div>

      {/* ── Non-grouped view: customers with 2+ batches for the day ── */}
      {pickupMode === 'ungrouped' && (
        <div className="pickup-controls">
          <div className="go-select-wrap">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <select className="go-select" value={ungroupedCustomerFilter} onChange={e => setUngroupedCustomerFilter(e.target.value)}>
              <option value="">{t.pickupAllCustomers}</option>
              {ungroupedCustomers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
            </select>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>

          {/* Per-customer actions when one is selected: merge the day's open batches,
              or group any still-standalone orders into a batch. */}
          {ungroupedCustomerFilter && (() => {
            const mergeable = mergeableByCustomer.get(ungroupedCustomerFilter) ?? [];
            const summary   = daySummary.find(c => c.customerId === ungroupedCustomerFilter);
            const name      = ungroupedCustomers.find(c => c.id === ungroupedCustomerFilter)?.name ?? summary?.businessName ?? '';
            return (
              <>
                {canGroup && mergeable.length >= 2 && (
                  <button className="pickup-cust__merge" onClick={() => setMergingCustomer({ name, batches: mergeable })}>
                    {t.pickupMergeBtn}
                  </button>
                )}
                {canGroup && summary && summary.unattachedOrders > 0 && (
                  <button className="pickup-cust__group" onClick={() => { setGroupingDate(effectiveDay); setGroupingCustomer(summary ?? null); }}>
                    {t.pickupGroupOrdersBtn}
                  </button>
                )}
              </>
            );
          })()}

          {ungroupedCustomers.length === 0 && (
            <span className="go-count">{t.pickupNoUngrouped}</span>
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
              : `${t.goOrderCount(visibleOrders.length, totalCount)}${hasFilters ? ` ${t.goOrdersMatched}` : ''}`
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
      </>)}

      {/* States */}
      {loading && <div className="go-loading"><div className="go-spinner" />{t.goLoadingOrders}</div>}
      {!loading && error && <div className="go-error">{error}</div>}
      {!loading && !error && displayList.length === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{pickupMode === 'ungrouped' ? t.pickupNoUngrouped : hasFilters ? t.goNoOrdersFilters : t.goNoOrders}</span>
        </div>
      )}

      {/* Group order list — date-sectioned accordion */}
      {!loading && !error && displayList.length > 0 && (() => {
        // ── Flat view: recipient party + location filter active (Grouped only) ──
        const showFlat = pickupMode === 'grouped' && filterParty === 'recipient' && hasLocationFilter;

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
                    <th>{t.goSender}</th>
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
                      <td>
                        <div style={{ fontWeight: 600 }}>{o._go.senderBusinessName || '—'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{o._go.senderFirstName} {o._go.senderLastName}</div>
                      </td>
                      <td><div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div></td>
                      <td style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>{o.recipientPhone}</td>
                      <td>
                        <div>{locCity(pickupCityFor(o), pickupCityGeoFor(o))}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{locDistrict(pickupDistrictFor(o), pickupDistrictGeoFor(o))}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{pickupAddressFor(o)}</td>
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
                          onRefresh={() => load(page)}
                          canManage={canManage}
                          onEdit={canManage ? () => openEditOrder(o, o._go) : undefined} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // ── Default: date-sectioned accordion ────────────────────────────────
        const sections = groupByDate(displayList);
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
                              <PhoneActions phone={go.senderPhone} />
                              {go.alternativeSenderPhone && (
                                <PhoneActions phone={go.alternativeSenderPhone} />
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
                              {go.isStandalone && (
                                <span style={{ marginTop: 3, fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-accent)', background: 'var(--color-accent-dim)', borderRadius: 100, padding: '1px 7px', whiteSpace: 'nowrap' }}>
                                  {t.pickupStandaloneBadge}
                                </span>
                              )}
                              {go.courierId && (
                                <span style={{ marginTop: 3, fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
                                  {go.courierFullName}
                                </span>
                              )}
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
                        {go.isStandalone ? (
                          // A standalone Return is shown for visibility only. Grouping /
                          // accepting / warehousing it would move it out of the Return
                          // statuses the courier's pickup list is keyed on and it would
                          // disappear from the assigned courier's dashboard — the backend
                          // rejects those actions too. Returns are driven from Return & Exchange.
                          go.orders[0]?.orderType === 'Return' ? (
                            <div style={{ paddingRight: 12, flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                              {t.pickupReturnManagedElsewhere}
                            </div>
                          ) : (canGroup || canManage) && go.customerId && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {canGroup && (
                                <button className="go-action-btn go-action-btn--ghost"
                                  onClick={e => { e.stopPropagation(); setGroupingDate(new Date(georgianDateKeyOf(go.createdAt) + 'T00:00:00')); setGroupingCustomer({ customerId: go.customerId!, businessName: go.senderBusinessName, ordersPlaced: 1, unattachedOrders: 1 }); }}>
                                  {t.pickupGroupOrdersBtn}
                                </button>
                              )}
                              {canManage && (
                                <button className="go-action-btn go-action-btn--accept"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const bs = batchesFor(go.customerId!, georgianDateKeyOf(go.createdAt));
                                    setAcceptTargetId(bs[0]?.id ?? '');
                                    setAcceptStandalone(go);
                                  }}>
                                  {t.goAccept}
                                </button>
                              )}
                              {canManage && (
                                <button className="go-action-btn go-action-btn--warehouse"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setWhTargetId('');          // default: create a new 1-order batch
                                    setWhCourierId('');
                                    setWhStandalone(go);
                                  }}>
                                  {t.goForceWarehouse}
                                </button>
                              )}
                            </div>
                          )
                        ) : (
                          <AdminGroupOrderActions
                            groupOrder={go} couriers={couriers} token={token ?? ''}
                            onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
                            onRefresh={() => load(page)}
                            canManage={canManage}
                            canAssignCourier={canAssignCourier}
                            warehousePresentIds={go.status === 'DeliveredToWarehouse'
                              ? go.orders.filter(o => o.status === 'DeliveredToWarehouse' && !absentPkgs.has(o.id)).map(o => o.id)
                              : undefined}
                            warehouseAbsentCount={go.status === 'DeliveredToWarehouse'
                              ? go.orders.filter(o => o.status === 'DeliveredToWarehouse' && absentPkgs.has(o.id)).length
                              : undefined}
                          />
                        )}
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
                                      <td>
                                        <span className="tn-badge">{o.trackingNumber}</span>
                                        {canManage && o.status === 'DeliveredToWarehouse' && (
                                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: 'var(--color-text-subtle)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                            <input type="checkbox" style={{ cursor: 'pointer' }}
                                              checked={!absentPkgs.has(o.id)}
                                              onChange={() => togglePkgPresent(o.id)} />
                                            {t.goWarehousePresent}
                                          </label>
                                        )}
                                      </td>
                                      <td><div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div></td>
                                      <td style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>{o.recipientPhone}</td>
                                      <td>
                                        <div>{locCity(pickupCityFor(o), pickupCityGeoFor(o))}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{locDistrict(pickupDistrictFor(o), pickupDistrictGeoFor(o))}</div>
                                      </td>
                                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{pickupAddressFor(o)}</td>
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
                                            onRefresh={() => load(page)}
                                            canManage={canManage}
                                            onEdit={canManage ? () => openEditOrder(o, go) : undefined} />
                                          {canGroup && moveDestinations.length > 0 && (
                                            <MoveOrderControl
                                              orderId={o.id}
                                              destinations={moveDestinations}
                                              token={token ?? ''}
                                              onMoved={() => { void load(page); void loadSummary(); showToast(t.pickupMovedToast); }}
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
        onSaved={() => { setEditing(null); load(page); }}
        token={token ?? ''}
        couriers={couriers}
        customerPricing={editing?.pricing ?? null}
        canSeeRevenue={canSeeRevenue}
      />

      {/* Group a customer's unattached orders for the day */}
      {groupingCustomer && (
        <GroupingModal
          customer={groupingCustomer}
          date={groupingDate}
          batches={batchesFor(groupingCustomer.customerId, toDateKey(groupingDate))}
          token={token ?? ''}
          onClose={() => setGroupingCustomer(null)}
          onGrouped={n => {
            setGroupingCustomer(null);
            showToast(t.pickupGroupedToast(n));
            void load(page);
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
            void load(page);
            void loadSummary();
          }}
        />
      )}

      {/* Accept a standalone order: choose which batch to merge into (or a new one), then accept */}
      {acceptStandalone && (() => {
        const batches = acceptStandalone.customerId ? batchesFor(acceptStandalone.customerId, georgianDateKeyOf(acceptStandalone.createdAt)) : [];
        return createPortal(
          <div className="pickup-modal__overlay" onClick={() => { if (!acceptBusy) setAcceptStandalone(null); }}>
            <div className="pickup-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="pickup-modal__header">
                <div>
                  <h3 className="pickup-modal__title">{t.pickupStandaloneAcceptTitle}</h3>
                  <p className="pickup-modal__subtitle">
                    {batches.length > 0 ? t.pickupStandaloneAcceptChoose : t.pickupStandaloneAcceptNewOnly(acceptStandalone.senderBusinessName)}
                  </p>
                </div>
                <button className="pickup-modal__close" onClick={() => setAcceptStandalone(null)} disabled={acceptBusy} aria-label={t.close}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </button>
              </div>
              {batches.length > 0 && (
                <div className="pickup-modal__body">
                  <label className="pickup-modal__target">
                    <span>{t.pickupGroupTarget}</span>
                    <select className="go-select" value={acceptTargetId} onChange={e => setAcceptTargetId(e.target.value)} disabled={acceptBusy}>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}
                        </option>
                      ))}
                      <option value="">{t.pickupGroupNewBatch}</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="pickup-modal__footer" style={{ paddingTop: 16 }}>
                <button className="go-action-btn go-action-btn--ghost" onClick={() => setAcceptStandalone(null)} disabled={acceptBusy}>
                  {t.cancel}
                </button>
                <button className="go-action-btn go-action-btn--accept" disabled={acceptBusy}
                  onClick={async () => {
                    setAcceptBusy(true);
                    try {
                      await groupAndAcceptStandalone(token ?? '', acceptStandalone.id, acceptTargetId || undefined);
                      setAcceptStandalone(null);
                      showToast(t.pickupStandaloneAcceptedToast);
                      void load(page);
                      void loadSummary();
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : t.goActionFailed, 'err');
                    } finally {
                      setAcceptBusy(false);
                    }
                  }}>
                  {acceptBusy ? t.pickupStandaloneAccepting : t.pickupStandaloneAcceptConfirm}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Mark a standalone order in warehouse: group/merge (or new batch) + pickup courier */}
      {whStandalone && (() => {
        const batches = whStandalone.customerId ? batchesFor(whStandalone.customerId, georgianDateKeyOf(whStandalone.createdAt)) : [];
        const targetBatch = batches.find(b => b.id === whTargetId);
        const courierRequired = !targetBatch?.courierId;   // new batch / courier-less batch needs one
        const activeCouriers = couriers.filter(c => !c.isDeleted);
        return createPortal(
          <div className="pickup-modal__overlay" onClick={() => { if (!whBusy) setWhStandalone(null); }}>
            <div className="pickup-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="pickup-modal__header">
                <div>
                  <h3 className="pickup-modal__title">{t.pickupStandaloneWhTitle}</h3>
                  <p className="pickup-modal__subtitle">
                    {batches.length > 0 ? t.pickupStandaloneWhChoose : t.pickupStandaloneWhNewOnly(whStandalone.senderBusinessName)}
                  </p>
                </div>
                <button className="pickup-modal__close" onClick={() => setWhStandalone(null)} disabled={whBusy} aria-label={t.close}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="pickup-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {batches.length > 0 && (
                  <label className="pickup-modal__target">
                    <span>{t.pickupGroupTarget}</span>
                    <select className="go-select" value={whTargetId} onChange={e => setWhTargetId(e.target.value)} disabled={whBusy}>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}
                        </option>
                      ))}
                      <option value="">{t.pickupGroupNewBatch}</option>
                    </select>
                  </label>
                )}
                {courierRequired && (
                  <label className="pickup-modal__target">
                    <span>{t.pickupStandaloneWhCourier}</span>
                    <select className="go-select" value={whCourierId} onChange={e => setWhCourierId(e.target.value)} disabled={whBusy}>
                      <option value="">{t.goChooseCourierOption}</option>
                      {activeCouriers.map(c => (
                        <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}, {c.assignedDistrict}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="pickup-modal__footer" style={{ paddingTop: 16 }}>
                <button className="go-action-btn go-action-btn--ghost" onClick={() => setWhStandalone(null)} disabled={whBusy}>
                  {t.cancel}
                </button>
                <button className="go-action-btn go-action-btn--warehouse" disabled={whBusy || (courierRequired && !whCourierId)}
                  onClick={async () => {
                    setWhBusy(true);
                    try {
                      await groupAndWarehouseStandalone(token ?? '', whStandalone.id, {
                        targetGroupOrderId: whTargetId || undefined,
                        courierId: whCourierId || undefined,
                      });
                      setWhStandalone(null);
                      showToast(t.pickupStandaloneWhToast);
                      void load(page);
                      void loadSummary();
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : t.goActionFailed, 'err');
                    } finally {
                      setWhBusy(false);
                    }
                  }}>
                  {whBusy ? t.pickupStandaloneAccepting : t.goForceWarehouse}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Pagination — the Grouped view's batch list is server-paginated. */}
      {pickupMode === 'grouped' && totalCount > PICKUP_PAGE_SIZE && (
        <div className="pickup-pagination">
          <button className="pickup-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t.aopPrevPage}
          </button>
          <span className="pickup-page-info">{t.aopPageInfo(page, Math.max(1, Math.ceil(totalCount / PICKUP_PAGE_SIZE)))}</span>
          <button className="pickup-page-btn" disabled={page >= Math.ceil(totalCount / PICKUP_PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>
            {t.aopNextPage}
          </button>
        </div>
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
                      <td>{locCity(pickupCityFor(o), pickupCityGeoFor(o))}, {pickupDistrictFor(o)}</td>
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

// One courier's work for the chosen day, in whichever leg the view is showing.
type CourierDayRow = { courier: Courier; items: (CourierDayDelivery | CourierDayPickup)[] };

// Matches a courier against a free-text query (name, username, phone, assigned city/district).
function courierMatchesSearch(c: Courier, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.fullName.toLowerCase().includes(q) ||
    c.username.toLowerCase().includes(q) ||
    c.phoneNumber.toLowerCase().includes(q) ||
    c.assignedCity.toLowerCase().includes(q) ||
    c.assignedDistrict.toLowerCase().includes(q)
  );
}

function AdminCouriers({
  couriers,
  token,
  onAdd,
  onEdit,
  onActiveChanged,
  canSeeRevenue = true,
}: {
  couriers: Courier[];
  token: string;
  onAdd: () => void;
  onEdit: (courier: Courier) => void;
  onActiveChanged: (courierId: string, isActive: boolean) => void;
  canSeeRevenue?: boolean;
}) {
  const { t } = useLanguage();
  // Free-text courier search (name / username / phone / assigned area) for this view.
  const [search, setSearch] = useState('');
  // Single global day for the whole list — defaults to today. Georgian, not browser-local:
  // the backend dates rows by Georgian wall-clock, so a browser in another zone must not
  // shift the day.
  const [day, setDay] = useState<Date>(() => georgianToday());
  // Which sub-view is showing: the day's assigned orders ('today') or the plain roster ('all').
  const [view, setView] = useState<'today' | 'all'>('today');
  // Which leg the day's assignments are shown for: last-mile delivery or warehouse pickup.
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveries, setDeliveries] = useState<CourierDayDelivery[]>([]);
  const [pickups, setPickups] = useState<CourierDayPickup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Transient failure banner for a per-row action (deliver/postpone/cancel) — separate from
  // `error` above, which blanks the whole list on an initial-load failure.
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 4000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const today = useMemo(() => georgianToday(), []);
  const dayKey = toDateKey(day);
  const isToday = dayKey === toDateKey(today);
  const shiftDay = (delta: number) =>
    setDay(d => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });

  // Fetch the day's assignments (delivery or pickup leg) whenever day or mode changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = mode === 'pickup'
      ? fetchAssignedPickupsForDay(dayKey, token).then(d => { if (!cancelled) setPickups(d); })
      : fetchAssignedForDay(dayKey, token).then(d => { if (!cancelled) setDeliveries(d); });
    request
      .catch(() => { if (!cancelled) setError(mode === 'pickup' ? 'Failed to load assigned pickups' : 'Failed to load assigned orders'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dayKey, token, mode]);

  // Silently re-fetch the day's deliveries after a per-row action (mark delivered/postpone/
  // cancel) mutates an order — no loading spinner, mirrors the Packages page's `loadSilent`.
  const reloadDeliveries = useCallback(() => {
    fetchAssignedForDay(dayKey, token).then(setDeliveries).catch(() => {});
  }, [dayKey, token]);
  // Same, for the pickup leg — needed after a (bulk) pickup-courier reassignment.
  const reloadPickups = useCallback(() => {
    fetchAssignedPickupsForDay(dayKey, token).then(setPickups).catch(() => {});
  }, [dayKey, token]);

  // Cross-courier multi-select for bulk reassignment — a set of order ids (delivery mode)
  // or group-order ids (pickup mode). Cleared whenever the underlying id-space changes.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [mode, dayKey]);
  const toggleSelected = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [bulkCourierId, setBulkCourierId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const runBulkReassign = async () => {
    if (!bulkCourierId || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const result = mode === 'pickup'
        ? await bulkAssignCourierToGroupOrders(token, [...selected], bulkCourierId)
        : await bulkAssignCourierToOrders(token, [...selected], bulkCourierId);
      if (mode === 'pickup') reloadPickups(); else reloadDeliveries();
      setSelected(new Set());
      setBulkCourierId('');
      // Individual items can fail validation (e.g. no longer in an assignable status)
      // without the whole request throwing — surface that instead of staying silent.
      if (result.failed.length > 0) {
        setActionError(t.aopAssignedPartial(result.succeeded.length, result.failed.length));
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.goActionFailed);
    } finally {
      setBulkBusy(false);
    }
  };

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

  const rows: CourierDayRow[] = mode === 'pickup' ? pickupRows : deliveryRows;
  // Narrow to couriers matching the search box. Searching looks at the whole roster, not
  // just couriers with work on this day, so looking someone up answers "nothing on this
  // day" instead of the ambiguous "no such courier".
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const itemsByCourier = new Map(rows.map(r => [r.courier.courierId, r.items]));
    return couriers
      // Deactivated couriers only surface if they actually worked this day.
      .filter(c => courierMatchesSearch(c, search) && (!c.isDeleted || itemsByCourier.has(c.courierId)))
      .map(c => ({ courier: c, items: itemsByCourier.get(c.courierId) ?? [] }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [rows, couriers, search]);

  // Totals track what's actually on screen, so they stay honest while searching.
  const totalAssigned = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.items.length, 0),
    [filteredRows],
  );
  // Pickup mode: total single orders (packages) across the batches shown.
  const totalSingleOrders = useMemo(
    () => (mode === 'pickup'
      ? filteredRows.reduce(
          (sum, r) => sum + (r.items as CourierDayPickup[]).reduce((s, p) => s + p.numberOfPackages, 0),
          0)
      : 0),
    [filteredRows, mode],
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
        search={search}
        onSearchChange={setSearch}
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
            {isToday
              ? t.crwNavCurrentlyHeld
              : mode === 'pickup' ? t.crwNavPickedUpOn : t.crwNavDeliveredOn}
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
            {filteredRows.length} courier{filteredRows.length !== 1 ? 's' : ''} ·{' '}
            {mode === 'pickup'
              ? <>{totalAssigned} {t.crwModePickup.toLowerCase()} · {totalSingleOrders} {t.crwOrdersWord}</>
              : <>{totalAssigned} {isToday ? 'assigned' : 'delivered'}</>}
          </span>
        </div>
      </div>

      {/* Bulk reassign bar — appears once at least one order/batch is selected below.
          Sticky so it stays reachable while scrolling a long courier list, mirroring
          AdminPackagesPage's .aop-bulk-bar (position/top/z-index). */}
      {selected.size > 0 && (
        <div
          className="content-card"
          style={{
            marginBottom: 16, position: 'sticky', top: 'var(--staff-nav-h, 64px)', zIndex: 20,
            background: 'linear-gradient(var(--color-accent-dim), var(--color-accent-dim)), var(--color-bg)',
            border: '1px solid rgba(196,127,23,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>{t.goNSelected(selected.size)}</span>
            <select
              value={bulkCourierId}
              onChange={e => setBulkCourierId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-2)', color: 'var(--color-text)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}
            >
              <option value="">{t.goChooseCourierOption}</option>
              {couriers.filter(c => !c.isDeleted).map(c => (
                <option key={c.courierId} value={c.courierId}>{c.fullName}</option>
              ))}
            </select>
            <button
              className="go-action-btn go-action-btn--assign"
              disabled={!bulkCourierId || bulkBusy}
              onClick={runBulkReassign}
            >
              {bulkBusy ? t.aopSaving : t.goReassignCourierBtn}
            </button>
            <button className="go-action-btn go-action-btn--ghost" onClick={() => setSelected(new Set())}>
              {t.goClearSelection}
            </button>
          </div>
        </div>
      )}

      <div className="content-card">
        <div className="content-card__header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="content-card__title">{mode === 'pickup' ? t.crwTitlePickups : t.crwTitleDeliveries}</span>
          <div className="go-search" style={{ flexShrink: 0, marginLeft: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder={t.courierSearchPh}
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
        </div>
        {loading ? (
          <div className="go-loading"><div className="go-spinner" />{mode === 'pickup' ? t.crwLoadingPickups : t.crwLoadingDeliveries}</div>
        ) : error ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
            {search.trim() ? t.courierSearchNoMatch : mode === 'pickup' ? t.crwEmptyPickups : t.crwEmptyDeliveries}
          </div>
        ) : mode === 'pickup' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filteredRows.map(r => (
              <CourierPickupRow
                key={r.courier.courierId}
                courier={r.courier}
                pickups={r.items as CourierDayPickup[]}
                selected={selected}
                onToggleSelected={toggleSelected}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filteredRows.map(r => (
              <CourierRow
                key={r.courier.courierId}
                courier={r.courier}
                orders={r.items as CourierDayDelivery[]}
                canSeeRevenue={canSeeRevenue}
                token={token}
                couriers={couriers}
                onChanged={reloadDeliveries}
                onError={setActionError}
                selected={selected}
                onToggleSelected={toggleSelected}
              />
            ))}
          </div>
        )}
      </div>

      {actionError && (
        <div className="action-toast action-toast--err" role="status">{actionError}</div>
      )}
    </>
  );
}

// ── Plain roster of every courier with management actions ─────────────────────
function AllCouriersList({
  couriers,
  token,
  search,
  onSearchChange,
  onBack,
  onEdit,
  onActiveChanged,
}: {
  couriers: Courier[];
  token: string;
  search: string;
  onSearchChange: (v: string) => void;
  onBack: () => void;
  onEdit: (courier: Courier) => void;
  onActiveChanged: (courierId: string, isActive: boolean) => void;
}) {
  const { t } = useLanguage();
  const filtered = useMemo(
    () => (search.trim() ? couriers.filter(c => courierMatchesSearch(c, search)) : couriers),
    [couriers, search],
  );
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
      <div className="content-card__header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="go-action-btn go-action-btn--ghost" style={{ padding: '5px 11px', fontSize: '0.8rem' }} onClick={onBack}>
          ‹ Working Today
        </button>
        <span className="content-card__title">All Couriers</span>
        <div className="go-search" style={{ flexShrink: 0, marginLeft: 'auto' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder={t.courierSearchPh}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button onClick={() => onSearchChange('')} className="go-search-clear" aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
          {filtered.length} courier{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
          {t.courierSearchNoMatch}
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.map(courier => (
          <div
            key={courier.courierId}
            style={{ borderBottom: '1px solid var(--color-border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', opacity: courier.isDeleted ? 0.6 : 1 }}
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
            {courier.defaultSalary != null && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent)', background: 'var(--color-accent-dim)', border: '1px solid rgba(196,127,23,0.25)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                {t.courierDefaultSalary} ₾{courier.defaultSalary.toFixed(2)}
              </span>
            )}
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
      )}

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
// A batch's pickup courier can only be (re)assigned while it's still awaiting pickup —
// mirrors AssignCourierToGroupOrderCommandHandler's validStatuses.
const PICKUP_ROW_REASSIGNABLE_STATUSES = ['AcceptedGroupOrder', 'CourierAssignedToPickUp'];
function isPickupRowReassignable(p: CourierDayPickup): boolean {
  return PICKUP_ROW_REASSIGNABLE_STATUSES.includes(p.status);
}

function CourierPickupRow({ courier, pickups, selected, onToggleSelected }: {
  courier: Courier; pickups: CourierDayPickup[];
  selected: Set<string>; onToggleSelected: (id: string) => void;
}) {
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

      {/* Pickups for the selected day — selectable for bulk courier reassignment above */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)', animation: 'expand-in 0.15s ease both' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="go-orders-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
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
                    <td onClick={e => e.stopPropagation()}>
                      {isPickupRowReassignable(p) && (
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => onToggleSelected(p.id)}
                        />
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.senderBusinessName}</div>
                      <PhoneActions phone={p.senderPhone} />
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

// Mirrors AdminOrdersPage's isDeliverable: only Send/Exchange orders that have reached the
// warehouse (last-mile flow) can be marked delivered/postponed/cancelled-with-charge here.
const COURIER_ROW_LAST_MILE_STATUSES = [
  'AdminAcceptedOrderInWareHouse',
  'OrderIsOnItsWayToRecipientsCity',
  'CourierAssignedToDeliver',
  'CourierDeliveringTheOrderToRecipient',
  'DeliveryPostponed',
];
function isCourierRowDeliverable(o: CourierOrder): boolean {
  return o.orderType !== 'Return' && COURIER_ROW_LAST_MILE_STATUSES.includes(o.status);
}

function CourierRow({ courier, orders, canSeeRevenue = true, token, couriers, onChanged, onError, selected, onToggleSelected }: {
  courier: Courier; orders: CourierDayDelivery[]; canSeeRevenue?: boolean;
  token: string; couriers: Courier[]; onChanged: () => void; onError: (msg: string) => void;
  selected: Set<string>; onToggleSelected: (id: string) => void;
}) {
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

      {/* Deliveries for the selected day */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)', animation: 'expand-in 0.15s ease both' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="go-orders-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  <th>{t.aopThTracking}</th>
                  <th>{t.crwThSender}</th>
                  <th>{t.crwThCityAddress}</th>
                  <th>{t.aopThStatus}</th>
                  <th>{t.crwThSvcPrice}</th>
                  <th>{t.crwThCourierSalary}</th>
                  {canSeeRevenue && <th>{t.aopThRevenue}</th>}
                  <th>{t.crwThDelivered}</th>
                  <th>{t.goThActions}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const deliveredIso = o.deliveredAt ?? o.deliveredToWarehouseAt;
                  return (
                    <tr key={o.id}>
                      <td onClick={e => e.stopPropagation()}>
                        {isCourierRowDeliverable(o) && (
                          <input
                            type="checkbox"
                            checked={selected.has(o.id)}
                            onChange={() => onToggleSelected(o.id)}
                          />
                        )}
                      </td>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.senderBusinessName || '—'}</div>
                      </td>
                      <td>
                        <div>{pickupCityFor(o)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{pickupAddressFor(o)}</div>
                      </td>
                      <td><StatusBadge status={o.status} /></td>
                      <td style={{ fontWeight: 600 }}>₾{o.companyServicePrice.toFixed(2)}</td>
                      <td>
                        {o.courierSalary != null
                          ? <span style={{ color: '#f97316', fontWeight: 600 }}>₾{o.courierSalary.toFixed(2)}</span>
                          : <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      {canSeeRevenue && (
                      <td>
                        {o.companyRevenue != null
                          ? <span style={{ color: o.companyRevenue >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>₾{o.companyRevenue.toFixed(2)}</span>
                          : <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      )}
                      <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                        {deliveredIso ? new Date(deliveredIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <OrderRowActionsMenu
                          order={{ id: o.id, orderType: o.orderType, status: o.status, courierId: o.courierId, courierSalary: o.courierSalary }}
                          couriers={couriers}
                          token={token}
                          canManage
                          canAssign={isCourierRowDeliverable(o)}
                          canDeliver={isCourierRowDeliverable(o)}
                          showView={false}
                          showEdit={false}
                          onView={() => {}}
                          onEdit={() => {}}
                          onChanged={onChanged}
                          onError={onError}
                        />
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
