import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { setCourierSalary, setCompanyServicePrice, bulkAssignCourierToOrders, adminMarkOrderDelivered, exportOrdersExcel, fetchOrderLocations } from '../../api/orders';
import { fetchCouriers } from '../../api/couriers';
import type { Courier } from '../../api/couriers';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { EditOrderModal } from './EditOrderModal';
import { ViewOrderModal } from './ViewOrderModal';
import { SalaryWarningModal } from './SalaryWarningModal';
import { PriceWarningModal } from './PriceWarningModal';
import { OrderRowActionsMenu } from './OrderRowActionsMenu';
import { printParcelLabels, type ParcelLabelData } from '../../utils/printLabel';
import { recipientDisplayName } from '../../utils/recipientName';
import { resolveDateWindow } from '../../utils/dateWindow';
import { DateRangeNav } from '../../components/ui/DateRangeNav';
import { DebouncedSearchBox } from '../../components/ui/DebouncedSearchBox';
import { PhoneActions } from '../../components/ui/PhoneActions';
import type { PagedResult } from '../../types/paging';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminOrderItem {
  id: string;
  trackingNumber: string;
  senderBusinessName: string;
  senderFirstName: string;
  senderLastName: string;
  senderPhone: string;
  alternativeSenderPhone: string | null;
  // Batch this order belongs to (null for standalone Return/Customer-direct orders) and the
  // sender's pickup location — used to group results by sender on the Packages page.
  groupOrderId: string | null;
  pickUpCity: string;
  pickUpDistrict: string;
  pickUpAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientCityGeo?: string;
  recipientDistrict: string;
  recipientDistrictGeo?: string;
  recipientAddress: string;
  description: string | null;
  isFragile: boolean;
  orderType: string;
  status: string;
  productPaymentStatus: string;
  whoPaysForCompanyService: string;
  companyServicePrice: number;
  isCompanyServicePriceIncluded: boolean;
  courierSalary: number | null;
  companyRevenue: number | null;
  amountToCollectForPackage: number | null;
  returnPickupCity: string | null;
  returnPickupDistrict: string | null;
  returnPickupAddress: string | null;
  courierId: string | null;
  courierFullName: string | null;
  createdAt: string;
  deliveredAt: string | null;
  postponeReason: string | null;
  postponeComment: string | null;
  // Optional extras — populated by the History view for a full order picture; the
  // Delivery list leaves them undefined, so the modal simply omits those rows.
  amountOfCashCollected?: number | null;
  cancellationReason?: string | null;
  cancellationComment?: string | null;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAllOrders(
  token: string,
  params: {
    city?: string; district?: string; search?: string;
    courierId?: string; unpriced?: boolean; assigned?: boolean; activeOnly?: boolean;
    date?: string; dateTo?: string; page?: number; pageSize?: number;
  }
): Promise<PagedResult<AdminOrderItem>> {
  const qs = new URLSearchParams();
  if (params.city)       qs.set('city',      params.city);
  if (params.district)   qs.set('district',  params.district);
  if (params.search)     qs.set('search',    params.search);
  if (params.courierId)  qs.set('courierId', params.courierId);
  if (params.unpriced)   qs.set('unpriced',  'true');
  if (params.assigned !== undefined) qs.set('assigned', String(params.assigned));
  if (params.activeOnly) qs.set('activeOnly', 'true');
  if (params.date)       qs.set('date',      params.date);
  if (params.dateTo)     qs.set('dateTo',    params.dateTo);
  if (params.page)       qs.set('page',      String(params.page));
  if (params.pageSize)   qs.set('pageSize',  String(params.pageSize));
  const res = await fetch(`/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

async function fetchUnpricedCount(token: string, courierId?: string, date?: string, dateTo?: string, activeOnly?: boolean): Promise<number> {
  const qs = new URLSearchParams({ unpriced: 'true', pageSize: '1', page: '1' });
  if (courierId)  qs.set('courierId', courierId);
  if (date)       qs.set('date', date);
  if (dateTo)     qs.set('dateTo', dateTo);
  if (activeOnly) qs.set('activeOnly', 'true');
  const res = await fetch(`/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data: PagedResult<AdminOrderItem> = await res.json();
  return data.totalCount;
}

// Orders that can be (re)assigned to a courier from the Packages page: warehouse-ready
// and en-route-to-city Send/Exchange, an already-assigned delivery (re-assignment to a
// different courier), an in-progress delivery (reassign mid-flight), a postponed delivery
// being reassigned/retried, and Return orders still awaiting / in pickup assignment. Any
// Send/Exchange status short of DeliveredToRecipient can be reassigned. Used by the
// select-all set, each row's checkbox, and the bulk-assign action so they stay in sync.
function isAssignable(o: AdminOrderItem): boolean {
  return o.status === 'AdminAcceptedOrderInWareHouse'
      || o.status === 'OrderIsOnItsWayToRecipientsCity'
      || o.status === 'CourierAssignedToDeliver'
      || o.status === 'CourierDeliveringTheOrderToRecipient'
      || o.status === 'DeliveryPostponed'
      || (o.orderType === 'Return' && (o.status === 'Pending' || o.status === 'CourierAssignedToPickUp'));
}

// Last-mile statuses — an order is in (or past) the warehouse and on its way to the
// recipient. Only here can a delivery courier be attributed and the order delivered.
const LAST_MILE_STATUSES = [
  'AdminAcceptedOrderInWareHouse',
  'OrderIsOnItsWayToRecipientsCity',
  'CourierAssignedToDeliver',
  'CourierDeliveringTheOrderToRecipient',
  'DeliveryPostponed',
];

// Orders the admin can mark "delivered to recipient" from the Packages page: only
// Send/Exchange orders that have reached the warehouse (last-mile flow). Orders still in the
// pickup flow stay locked — they must first be accepted into the warehouse on the Pick-Up
// page so the pickup courier is recorded, otherwise that trace is lost. Return orders are
// excluded — their final leg is a warehouse drop-off, not a recipient delivery.
function isDeliverable(o: AdminOrderItem): boolean {
  return o.orderType !== 'Return' && LAST_MILE_STATUSES.includes(o.status);
}

// Format a stored Georgian wall-clock timestamp (no offset) as date + time. Parsed as local,
// formatted as local — so the displayed numbers match the stored wall-clock regardless of tz.
function fmtDateTime(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

// Amount the recipient pays — matches what the courier actually collects: COD (only when
// not prepaid) + the company service fee whenever the recipient pays it. The fee is added
// even when the price was entered all-in, because the backend stores amountToCollectForPackage
// as the product-only portion (gross − fee), so the fee must be added back for the total.
function recipientAmountDue(o: AdminOrderItem): number {
  const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
  const fee = o.whoPaysForCompanyService === 'Recipient' ? (o.companyServicePrice ?? 0) : 0;
  return cod + fee;
}

// A Return order is picked up from `returnPickup*` (entered explicitly when the return
// was created) — not the "recipient" fields, which for Return orders hold the business's
// own address (where the item is ultimately returned to), not where the courier actually
// goes to collect it. No geo variant exists for return-pickup fields (plain text entry),
// unlike recipient city/district.
function pickupCityDisplay(o: AdminOrderItem, lang: string): string {
  if (o.orderType === 'Return' && o.returnPickupCity) return o.returnPickupCity;
  return lang === 'ka' && o.recipientCityGeo ? o.recipientCityGeo : o.recipientCity;
}
function pickupDistrictDisplay(o: AdminOrderItem, lang: string): string {
  if (o.orderType === 'Return' && o.returnPickupCity) return o.returnPickupDistrict ?? '';
  return lang === 'ka' && o.recipientDistrictGeo ? o.recipientDistrictGeo : o.recipientDistrict;
}
function pickupAddressDisplay(o: AdminOrderItem): string {
  return o.orderType === 'Return' && o.returnPickupCity ? (o.returnPickupAddress ?? '') : o.recipientAddress;
}

// Build the Georgian parcel-sticker payload from an admin order row.
function buildAdminLabel(o: AdminOrderItem): ParcelLabelData {
  const due = recipientAmountDue(o);
  const city     = o.orderType === 'Return' && o.returnPickupCity ? o.returnPickupCity     : (o.recipientCityGeo     || o.recipientCity);
  const district = o.orderType === 'Return' && o.returnPickupCity ? (o.returnPickupDistrict ?? '') : (o.recipientDistrictGeo || o.recipientDistrict);
  const address  = pickupAddressDisplay(o);
  return {
    storeName:        o.senderBusinessName,
    recipientName:    recipientDisplayName(o.recipientName, 'უცნობი'),
    recipientPhone:   o.recipientPhone,
    recipientAddress: [city, district, address].filter(Boolean).join(', '),
    amountText:       due > 0.005 ? `₾${due.toFixed(2)}` : 'გადახდილია',
    description:      o.description ?? undefined,
    trackingNumber:   o.trackingNumber,
  };
}

// ── Courier picker dropdown ───────────────────────────────────────────────────

interface CourierPickerProps {
  couriers: Courier[];
  selected: Courier | null;
  onSelect: (c: Courier | null) => void;
}

function CourierPicker({ couriers, selected, onSelect }: CourierPickerProps) {
  const { t } = useLanguage();
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return couriers;
    const q = query.toLowerCase();
    return couriers.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.assignedCity.toLowerCase().includes(q) ||
      c.assignedDistrict.toLowerCase().includes(q)
    );
  }, [couriers, query]);

  const handleSelect = (c: Courier | null) => {
    onSelect(c);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="cp-root" ref={ref}>
      <button
        className={`cp-trigger${selected ? ' cp-trigger--active' : ''}`}
        onClick={() => setOpen(v => !v)}
        type="button"
      >
        {selected ? (
          <>
            <span className="cp-avatar">{initials(selected.fullName)}</span>
            <span className="cp-trigger-name">{selected.fullName}</span>
            <span className="cp-trigger-city">{selected.assignedCity}</span>
            <span
              className="cp-clear"
              role="button"
              tabIndex={0}
              title={t.aopClearCourierTitle}
              onClick={e => { e.stopPropagation(); handleSelect(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleSelect(null); }}}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </span>
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>{t.aopAllCouriers}</span>
            <svg className="cp-chevron" width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="cp-dropdown">
          <div className="cp-search-wrap">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              autoFocus
              className="cp-search"
              placeholder={t.aopSearchCouriers}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button className="cp-search-clear" onClick={() => setQuery('')}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          <div className="cp-list">
            <button
              className={`cp-item${!selected ? ' cp-item--active' : ''}`}
              onClick={() => handleSelect(null)}
            >
              <span className="cp-item-all-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M1 14c0-2.5 2-4 4.5-4M8 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="cp-item-name">{t.aopAllCouriers}</span>
            </button>

            {filtered.length === 0 && (
              <div className="cp-empty">{t.aopNoCourierMatch(query)}</div>
            )}

            {filtered.map(c => (
              <button
                key={c.courierId}
                className={`cp-item${selected?.courierId === c.courierId ? ' cp-item--active' : ''}`}
                onClick={() => handleSelect(c)}
              >
                <span className="cp-item-avatar">{initials(c.fullName)}</span>
                <span className="cp-item-info">
                  <span className="cp-item-name">{c.fullName}</span>
                  <span className="cp-item-meta">{c.assignedCity}, {c.assignedDistrict}</span>
                </span>
                {selected?.courierId === c.courierId && (
                  <svg className="cp-item-check" width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
// The backend matches search as a prefix (StartsWith) per field — fast because it's
// index-backed, but a 1-character prefix is too broad to be a useful filter and would still
// fire a real query on every keystroke.
const MIN_SEARCH_CHARS = 2;

export default function AdminOrdersPage({ token: tokenProp, canManage = true, canSeeRevenue = true }: { token: string; canManage?: boolean; canSeeRevenue?: boolean }) {
  const { token: authToken } = useAuth();
  const { t, lang } = useLanguage();
  const token = tokenProp || authToken || '';
  // Tenant co-admins get a read-only Delivery page (canManage=false). Operators manage
  // fully (canManage=true) but never see company revenue/margin: canSeeRevenue=false hides
  // the Revenue column here and in the view/bulk modals (server also strips the value).

  // The raw per-keystroke value and its debounce live inside DebouncedSearchBox — this only
  // ever sees the settled value, so typing doesn't re-render this (large) page per character.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Bumped by "Clear filters" to force DebouncedSearchBox to remount back to empty — the
  // parent can no longer reach into its internal keystroke state directly.
  const [searchResetKey, setSearchResetKey] = useState(0);
  // Packages view tab: 'pending' = orders with no courier yet, 'assigned' = courier set.
  const [assignTab,       setAssignTab]       = useState<'pending' | 'assigned'>('pending');
  const [filterCity,      setFilterCity]      = useState('');
  const [filterDistrict,  setFilterDistrict]  = useState('');
  const [filterCourier,   setFilterCourier]   = useState<Courier | null>(null);
  const [filterUnpriced,  setFilterUnpriced]  = useState(false);
  // Day navigator — mirrors the Pick-Up page; filters by Order.CreatedAt (Georgian day).
  // selectedDate null = untouched/Show-All depending on dateTouched (see resolveDateWindow);
  // set = range start (single day when rangeEnd is null, else the inclusive span
  // [selectedDate..rangeEnd]).
  const [selectedDate,    setSelectedDate]    = useState<Date | null>(null);
  const [rangeEnd,        setRangeEnd]        = useState<Date | null>(null);
  // False until the admin interacts with the day navigator at all (including "Show All"/
  // "Today"). Untouched + no search → default to a rolling last-7-days window instead of
  // showing every order ever placed.
  const [dateTouched,     setDateTouched]     = useState(false);
  const [page,            setPage]            = useState(1);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());

  const [showTracking,  setShowTracking]  = useState(false);
  const [showPrices,    setShowPrices]    = useState(true);
  const [exporting,     setExporting]     = useState(false);
  // Price/salary columns follow canManage + the Show Prices toggle. The Revenue column
  // additionally requires canSeeRevenue (hidden from operators).
  const showPricesEff = canManage && showPrices;
  const showRevenueEff = showPricesEff && canSeeRevenue;

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPrice,     setBulkPrice]     = useState('');
  const [bulkSalary,    setBulkSalary]    = useState('');
  const [bulkBusy,      setBulkBusy]      = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [editingOrder,  setEditingOrder]  = useState<AdminOrderItem | null>(null);
  const [viewingOrder,  setViewingOrder]  = useState<AdminOrderItem | null>(null);

  // ── Mode toggle: 'assign' | 'prices' | 'deliver' ────────────────────────────
  type BulkMode = 'assign' | 'prices' | 'deliver';
  const [bulkMode,       setBulkMode]       = useState<BulkMode>('assign');
  const [bulkCourierId,  setBulkCourierId]  = useState('');
  const [bulkAssigning,  setBulkAssigning]  = useState(false);
  const [bulkDelivering, setBulkDelivering] = useState(false);
  // Salary warning/modal (moved from Group Orders)
  const [showSalaryWarning, setShowSalaryWarning] = useState(false);
  const [showSalaryModal,   setShowSalaryModal]   = useState(false);
  const [salaryDrafts,      setSalaryDrafts]      = useState<Record<string, string>>({});
  const [salaryChecked,     setSalaryChecked]     = useState<Set<string>>(new Set());
  const [salarySaving,      setSalarySaving]      = useState(false);
  // Service-price warning/modal — parallel to the salary flow.
  const [showPriceWarning,  setShowPriceWarning]  = useState(false);
  const [showPriceModal,    setShowPriceModal]    = useState(false);
  const [priceDrafts,       setPriceDrafts]       = useState<Record<string, string>>({});
  const [priceChecked,      setPriceChecked]      = useState<Set<string>>(new Set());
  const [priceSaving,       setPriceSaving]       = useState(false);
  // After a price/salary save inside the assign/deliver gating, the original action is
  // resumed automatically (see the effect below) so the admin doesn't have to re-click
  // "Assign"/"Mark delivered" once the missing financials are filled in.
  const [resumeAction,      setResumeAction]      = useState<null | 'assign' | 'deliver'>(null);

  // The bulk action bar is sticky at the top while scrolling the order list. Its height
  // is written directly to a CSS custom property on the root element so the sticky table
  // header always sits exactly below it — with no intermediate wrong-frame render.
  const bulkBarRef  = useRef<HTMLDivElement | null>(null);
  const aopRootRef  = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const queryClient = useQueryClient();

  // Couriers are shared with the Pick-Up page's own courier query (same key) — whichever
  // admin page loads first warms the cache for both.
  const couriersQuery = useQuery({
    queryKey: ['admin', 'couriers'] as const,
    queryFn: () => fetchCouriers(token),
    enabled: !!token,
  });
  const couriers = couriersQuery.data ?? [];

  // Default view (day navigator untouched) is all active orders — no date bound, scoped
  // to non-terminal statuses via activeOnly below (completed orders live on the History
  // page instead). An explicit day/range pick still browses that window.
  const { date: pkgDate, dateTo: pkgDateTo } = dateTouched
    ? resolveDateWindow({ dateTouched, search: debouncedSearch, selectedDate, rangeEnd })
    : {};

  const packagesFilters = {
    city:      filterCity     || undefined,
    district:  filterDistrict || undefined,
    search:    debouncedSearch || undefined,
    courierId: filterCourier?.courierId,
    unpriced:  filterUnpriced || undefined,
    assigned:  assignTab === 'assigned',
    activeOnly: true,
  };

  const listQueryKey = ['admin', 'delivery', 'list', packagesFilters, pkgDate, pkgDateTo, page] as const;

  const mainQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => fetchAllOrders(token, { ...packagesFilters, date: pkgDate, dateTo: pkgDateTo, page, pageSize: PAGE_SIZE }),
    enabled: !!token,
    // Keep the previous page/filter's rows on screen while the next combination loads
    // instead of flashing an empty list.
    placeholderData: keepPreviousData,
  });
  const data    = mainQuery.data ?? null;
  const loading = mainQuery.isPending;
  const error   = mainQuery.isError ? (mainQuery.error instanceof Error ? mainQuery.error.message : t.aopFailedLoad) : null;

  const unpricedQuery = useQuery({
    queryKey: ['admin', 'delivery', 'unpricedCount', filterCourier?.courierId ?? null, pkgDate, pkgDateTo] as const,
    queryFn: () => fetchUnpricedCount(token, filterCourier?.courierId, pkgDate, pkgDateTo, true),
    enabled: !!token,
  });
  const unpricedCount = unpricedQuery.data ?? null;

  // Reload the current view with the active filters — used by per-row actions (the kebab
  // menu) and after bulk mutations whose result was already applied to `data` optimistically
  // (see patchOrders). Writes straight into the query cache instead of going through
  // `mainQuery`'s own fetch/error state, so a transient failure here can never blank the
  // table or surface an error banner over an already-applied optimistic update — the admin
  // already got a success/failure toast from the mutation itself.
  const loadSilent = useCallback(() => {
    fetchAllOrders(token, { ...packagesFilters, date: pkgDate, dateTo: pkgDateTo, page, pageSize: PAGE_SIZE })
      .then(result => queryClient.setQueryData(listQueryKey, result))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, JSON.stringify(packagesFilters), pkgDate, pkgDateTo, queryClient]);

  const reload = () => {
    loadSilent();
    void unpricedQuery.refetch();
  };

  // Reset to page 1 (and clear the selection) whenever a filter changes.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCity, filterDistrict, debouncedSearch, filterCourier?.courierId, filterUnpriced, assignTab, pkgDate, pkgDateTo]);

  // Esc terminates the Mark-Delivered action: leave deliver mode and clear the selection.
  // Only active while in deliver mode, and never while a modal/warning dialog is open.
  useEffect(() => {
    if (bulkMode !== 'deliver') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showBulkModal || showPriceModal || showSalaryModal || showPriceWarning || showSalaryWarning) return;
      setBulkMode('assign');
      setSelected(new Set());
      setBulkCourierId('');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bulkMode, showBulkModal, showPriceModal, showSalaryModal, showPriceWarning, showSalaryWarning]);

  // Write --bulk-bar-h directly onto the root element so the sticky column headers sit
  // exactly below the bar with no intermediate wrong frame. useLayoutEffect fires before
  // the browser paints, so the sticky offset is always correct on first paint.
  useLayoutEffect(() => {
    const root = aopRootRef.current;
    const el   = bulkBarRef.current;
    if (!root) return;
    if (!el) { root.style.setProperty('--bulk-bar-h', '0px'); return; }
    const update = () => root.style.setProperty('--bulk-bar-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canManage, selected.size, bulkMode]);

  // Load the city/district pairs actually used in orders so the filters are complete across
  // all pages (the old approach derived them from the loaded page only, hiding districts
  // whose orders sat on another page, e.g. Tskneti). Scoped to the selected Georgian day.
  const locationsQuery = useQuery({
    queryKey: ['admin', 'delivery', 'locations', pkgDate, pkgDateTo] as const,
    queryFn: () => fetchOrderLocations(token, pkgDate, pkgDateTo),
    enabled: !!token,
  });
  const orderLocations = locationsQuery.data ?? [];

  // Filter value is the English name (what the backend matches on recipientCity/District);
  // the label shows the Georgian name when the UI is in Georgian.
  const cities = useMemo(() => {
    const byName = new Map<string, string>();
    for (const l of orderLocations) {
      if (!byName.has(l.city)) {
        byName.set(l.city, lang === 'ka' && l.cityGeo ? l.cityGeo : l.city);
      }
    }
    return [...byName.entries()]
      .map(([value, optionLabel]) => ({ value, label: optionLabel }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orderLocations, lang]);

  const districts = useMemo(() => {
    if (!filterCity) return [];
    const byName = new Map<string, string>();
    for (const l of orderLocations) {
      if (l.city === filterCity && !byName.has(l.district)) {
        byName.set(l.district, lang === 'ka' && l.districtGeo ? l.districtGeo : l.district);
      }
    }
    return [...byName.entries()]
      .map(([value, optionLabel]) => ({ value, label: optionLabel }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orderLocations, filterCity, lang]);

  const orders = data?.items ?? [];

  const selectableOrders = useMemo(() =>
    bulkMode === 'assign'  ? orders.filter(isAssignable)  :
    bulkMode === 'deliver' ? orders.filter(isDeliverable) :
    orders,
  [orders, bulkMode]);

  const allSelected  = selectableOrders.length > 0 && selectableOrders.every(o => selected.has(o.id));
  const someSelected = selected.size > 0;

  // "Select all" must cover every order matching the active filters, not just the loaded
  // page (PAGE_SIZE caps `orders` at 30) — otherwise a bulk assign silently drops whatever
  // didn't fit on the current page. When more exists than what's loaded, fetch the whole
  // filtered set unpaged and cache the extra items so downstream lookups (actionPool,
  // doAssign, print labels) can resolve ids that live outside the current page.
  const [selectAllCache, setSelectAllCache] = useState<Map<string, AdminOrderItem>>(new Map());
  const [selectAllBusy,  setSelectAllBusy]  = useState(false);
  const orderCache = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const findOrder = useCallback(
    (id: string) => orderCache.get(id) ?? selectAllCache.get(id),
    [orderCache, selectAllCache],
  );

  // Apply a mutation's known effect to the loaded orders immediately, without waiting for
  // a server round trip — this is what makes assign/salary/price/deliver actions feel
  // instant. `removeIf` drops rows that no longer belong in the current tab/filter (e.g. an
  // order that just got a courier should vanish from the "Pending Assign" tab). The matching
  // background `loadSilent()` call still runs to reconcile totals/pagination.
  const patchOrders = useCallback((
    ids: string[],
    patch: (o: AdminOrderItem) => AdminOrderItem,
    removeIf?: (patched: AdminOrderItem) => boolean,
  ) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    queryClient.setQueryData(listQueryKey, (prev: PagedResult<AdminOrderItem> | undefined) => {
      if (!prev) return prev;
      let removed = 0;
      const items: AdminOrderItem[] = [];
      for (const o of prev.items) {
        if (!idSet.has(o.id)) { items.push(o); continue; }
        const patched = patch(o);
        if (removeIf?.(patched)) { removed++; continue; }
        items.push(patched);
      }
      return removed > 0
        ? { ...prev, items, totalCount: Math.max(0, prev.totalCount - removed) }
        : { ...prev, items };
    });
    setSelectAllCache(prev => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      let changed = false;
      for (const id of ids) {
        const o = next.get(id);
        if (!o) continue;
        const patched = patch(o);
        changed = true;
        if (removeIf?.(patched)) next.delete(id); else next.set(id, patched);
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, JSON.stringify(listQueryKey)]);

  const toggleAll = async () => {
    if (allSelected) { setSelected(new Set()); return; }
    if (!data || data.totalCount <= orders.length) {
      setSelected(new Set(selectableOrders.map(o => o.id)));
      return;
    }
    setSelectAllBusy(true);
    try {
      const { date, dateTo } = dateTouched
        ? resolveDateWindow({ dateTouched, search: debouncedSearch, selectedDate, rangeEnd })
        : {};
      const full = await fetchAllOrders(token, {
        city:      filterCity || undefined,
        district:  filterDistrict || undefined,
        search:    debouncedSearch || undefined,
        courierId: filterCourier?.courierId,
        unpriced:  filterUnpriced || undefined,
        assigned:  assignTab === 'assigned',
        activeOnly: true,
        date, dateTo,
        page: 1, pageSize: data.totalCount,
      });
      const selectable = bulkMode === 'assign'  ? full.items.filter(isAssignable)  :
                          bulkMode === 'deliver' ? full.items.filter(isDeliverable) :
                          full.items;
      setSelectAllCache(prev => {
        const next = new Map(prev);
        selectable.forEach(o => next.set(o.id, o));
        return next;
      });
      setSelected(new Set(selectable.map(o => o.id)));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopFailedLoad, 'err');
    } finally {
      setSelectAllBusy(false);
    }
  };

  const toggleOne    = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Export to Excel: the currently selected orders if any are ticked, otherwise every
  // order matching the active filters (across all pages — the server re-applies them).
  const handleExport = async () => {
    setExporting(true);
    try {
      const { date, dateTo } = dateTouched
        ? resolveDateWindow({ dateTouched, search: debouncedSearch, selectedDate, rangeEnd })
        : {};
      await exportOrdersExcel(token, {
        city:      filterCity || undefined,
        district:  filterDistrict || undefined,
        search:    debouncedSearch || undefined,
        courierId: filterCourier?.courierId,
        unpriced:  filterUnpriced || undefined,
        assigned:  assignTab === 'assigned',
        activeOnly: selected.size === 0,
        date,
        dateTo,
        ids:       selected.size > 0 ? [...selected] : undefined,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setExporting(false);
    }
  };

  // Print parcel labels for the currently selected orders (same sticker as the customer side).
  const handlePrintLabels = () => {
    const labels = [...selected]
      .map(id => findOrder(id))
      .filter((o): o is AdminOrderItem => !!o)
      .map(buildAdminLabel);
    void printParcelLabels(labels);
  };

  const handleBulkApply = async () => {
    const price  = bulkPrice  ? parseFloat(bulkPrice)  : null;
    const salary = bulkSalary ? parseFloat(bulkSalary) : null;
    if ((price  !== null && (isNaN(price)  || price  < 0)) ||
        (salary !== null && (isNaN(salary) || salary < 0))) return;
    if (price === null && salary === null) return;
    if (selected.size === 0) return;

    setBulkBusy(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.flatMap(id => [
        ...(price  !== null ? [setCompanyServicePrice(token, id, price)]  : []),
        ...(salary !== null ? [setCourierSalary(token, id, salary)]       : []),
      ]));
      const parts = [
        price  !== null ? `${t.aopBulkSvcLabel} ₾${price.toFixed(2)}`  : '',
        salary !== null ? `${t.aopBulkSalLabel} ₾${salary.toFixed(2)}` : '',
      ].filter(Boolean).join(' + ');
      showToast(t.aopBulkApplied(parts, ids.length));
      setShowBulkModal(false);
      setBulkPrice('');
      setBulkSalary('');
      setSelected(new Set());
      await Promise.all([
        mainQuery.refetch(),
        unpricedQuery.refetch(),
      ]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setBulkBusy(false);
    }
  };

  const cancelBulk = () => { setShowBulkModal(false); setBulkPrice(''); setBulkSalary(''); };

  // ── Assign courier / Mark delivered ──────────────────────────────────────────
  // The pool of selected orders the current bulk action actually operates on —
  // scoped to the same orders the action will touch so the price/salary prompts
  // never list rows the action would skip.
  const actionPool = useMemo(() => {
    const picked = [...selected]
      .map(id => findOrder(id))
      .filter((o): o is AdminOrderItem => !!o);
    if (bulkMode === 'assign')  return picked.filter(isAssignable);
    if (bulkMode === 'deliver') return picked.filter(isDeliverable);
    return picked;
  }, [selected, findOrder, bulkMode]);

  // Orders the admin must manually price because no applicable courier default rate covers
  // them (mirrors the backend's auto-fill in AssignCourierToOrderCommandHandler /
  // AdminMarkOrderDeliveredCommandHandler — a Tbilisi courier's DefaultSalary is applied
  // automatically, so those orders don't need this gate). The "applicable" courier is
  // mode-dependent: assigning always (re)targets the newly chosen bulkCourierId, while
  // delivering never changes an existing assignee — only orders still missing one pick up
  // bulkCourierId.
  const missingSalaryOrders = useMemo(() => {
    const bulkCourierDefault = couriers.find(c => c.courierId === bulkCourierId)?.defaultSalary ?? null;
    return actionPool.filter(o => {
      if (o.courierSalary != null) return false;
      const ownerDefault = bulkMode === 'assign'
        ? bulkCourierDefault
        : o.courierId
          ? (couriers.find(c => c.courierId === o.courierId)?.defaultSalary ?? null)
          : bulkCourierDefault;
      return ownerDefault == null;
    });
  }, [actionPool, couriers, bulkCourierId, bulkMode]);

  // Orders with no company service price set (0 / null) — must be priced before
  // assigning or delivering, mirroring the salary requirement.
  const missingPriceOrders = useMemo(() =>
    actionPool.filter(o => !o.companyServicePrice),
  [actionPool]);

  // Deliverable selected orders with no courier yet — they need one chosen so the
  // delivery is attributed to a courier for settlement.
  const missingCourierOrders = useMemo(() =>
    actionPool.filter(o => !o.courierId),
  [actionPool]);

  const handleBulkAssign = async () => {
    if (!bulkCourierId || selected.size === 0) return;
    if (missingPriceOrders.length > 0) {
      const drafts: Record<string, string> = {};
      const checked = new Set<string>();
      missingPriceOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setPriceDrafts(drafts);
      setPriceChecked(checked);
      setShowPriceWarning(true);
      return;
    }
    if (missingSalaryOrders.length > 0) {
      const drafts: Record<string, string> = {};
      const checked = new Set<string>();
      missingSalaryOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setSalaryDrafts(drafts);
      setSalaryChecked(checked);
      setShowSalaryWarning(true);
      return;
    }
    await doAssign();
  };

  const doAssign = async () => {
    setBulkAssigning(true);
    const ids = [...selected].filter(id => {
      const o = findOrder(id);
      return !!o && isAssignable(o);
    });
    let ok = 0; let fail = 0;
    let succeededIds: string[] = [];
    try {
      const result = await bulkAssignCourierToOrders(token, ids, bulkCourierId);
      succeededIds = result.succeeded;
      ok = result.succeeded.length;
      fail = result.failed.length;
    } catch {
      fail = ids.length;
    }
    // Apply the assignment locally right away — mirrors what the backend just did
    // (BulkAssignCourierToOrdersCommandHandler), so the row updates instantly instead of
    // waiting on a full reload. Rows that no longer belong on the "Pending Assign" tab
    // (they now have a courier) disappear immediately too.
    if (succeededIds.length > 0) {
      const assignedCourierId = bulkCourierId;
      const assignedCourier = couriers.find(c => c.courierId === assignedCourierId);
      const courierName = assignedCourier?.fullName ?? null;
      const defaultSalary = assignedCourier?.defaultSalary ?? null;
      patchOrders(succeededIds, o => ({
        ...o,
        courierId: assignedCourierId,
        courierFullName: courierName ?? o.courierFullName,
        status: o.orderType === 'Return' ? 'CourierAssignedToPickUp' : 'CourierAssignedToDeliver',
        ...(o.orderType !== 'Return' && defaultSalary != null
          ? { courierSalary: defaultSalary, companyRevenue: o.companyServicePrice - defaultSalary }
          : {}),
      }), assignTab === 'pending' ? () => true : undefined);
    }
    setBulkAssigning(false);
    // Clear the selection after assigning — otherwise these orders stay ticked and get
    // re-assigned to the next courier the admin picks for a different order.
    setSelected(new Set());
    setBulkCourierId('');
    showToast(fail === 0 ? t.aopAssignedToast(ok)
                         : t.aopAssignedPartial(ok, fail), fail > 0 ? 'err' : 'ok');
    // Reconcile totals/pagination in the background — never blocks the instant UI update above.
    loadSilent();
    void unpricedQuery.refetch();
  };

  // ── Mark delivered ─────────────────────────────────────────────────────────
  // Same gating as Assign (price + salary must be set), plus a courier requirement:
  // any unassigned order needs a courier chosen so the delivery is attributed for
  // settlement. Delegates the actual cash/COD/service-fee handling to the backend,
  // which mirrors the courier's own "delivered to recipient" action.
  const handleBulkDeliver = async () => {
    if (actionPool.length === 0) { showToast(t.aopNoDeliverable, 'err'); return; }
    if (missingPriceOrders.length > 0) {
      const drafts: Record<string, string> = {};
      const checked = new Set<string>();
      missingPriceOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setPriceDrafts(drafts);
      setPriceChecked(checked);
      setShowPriceWarning(true);
      return;
    }
    if (missingSalaryOrders.length > 0) {
      const drafts: Record<string, string> = {};
      const checked = new Set<string>();
      missingSalaryOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setSalaryDrafts(drafts);
      setSalaryChecked(checked);
      setShowSalaryWarning(true);
      return;
    }
    if (missingCourierOrders.length > 0 && !bulkCourierId) {
      showToast(t.aopChooseCourierFirst, 'err');
      return;
    }
    await doDeliver();
  };

  const doDeliver = async () => {
    setBulkDelivering(true);
    const targets = [...selected]
      .map(id => findOrder(id))
      .filter((o): o is AdminOrderItem => !!o && isDeliverable(o));
    let ok = 0; let fail = 0;
    const succeededIds: string[] = [];
    await Promise.all(targets.map(async o => {
      try {
        // Assign the chosen courier only when the order has none — never override an
        // existing assignee. Any order still missing a salary at this point is covered by
        // its (existing or newly-chosen) courier's default rate — the backend auto-fills
        // it (AdminMarkOrderDeliveredCommandHandler); anything without a default was
        // already persisted by the salary modal above.
        await adminMarkOrderDelivered(token, o.id,
          !o.courierId && bulkCourierId ? { courierId: bulkCourierId } : undefined);
        ok++;
        succeededIds.push(o.id);
      }
      catch { fail++; }
    }));
    // Reflect the delivery locally right away instead of waiting on a full reload.
    if (succeededIds.length > 0) {
      const bulkCourier = couriers.find(c => c.courierId === bulkCourierId);
      const courierName = bulkCourier?.fullName ?? null;
      const nowIso = new Date().toISOString();
      patchOrders(succeededIds, o => {
        // Mirrors the backend's fallback: an order without a salary yet picks up its
        // (existing or newly-assigned) courier's default rate.
        const ownerDefault = o.courierSalary != null
          ? null
          : (o.courierId
              ? couriers.find(c => c.courierId === o.courierId)?.defaultSalary
              : bulkCourier?.defaultSalary) ?? null;
        return {
          ...o,
          status: 'DeliveredToRecipient',
          deliveredAt: o.deliveredAt ?? nowIso,
          courierId: o.courierId ?? bulkCourierId,
          courierFullName: o.courierId ? o.courierFullName : (courierName ?? o.courierFullName),
          ...(ownerDefault != null
            ? { courierSalary: ownerDefault, companyRevenue: o.companyServicePrice - ownerDefault }
            : {}),
        };
      });
    }
    setBulkDelivering(false);
    setBulkCourierId('');
    setSelected(new Set());
    showToast(fail === 0 ? t.aopDeliveredToast(ok)
                         : t.aopDeliveredPartial(ok, fail), fail > 0 ? 'err' : 'ok');
    loadSilent();
    void unpricedQuery.refetch();
  };

  // An order is still "unpriced" while either figure is missing/zero — mirrors the
  // backend's `Unpriced` filter (GetAllOrdersQueryHandler) so a locally-patched order that
  // just got fully priced can be dropped from that filtered view immediately.
  const isStillUnpriced = (o: AdminOrderItem) =>
    o.companyServicePrice === 0 || o.courierSalary == null || o.courierSalary === 0;

  const handleSalarySave = async () => {
    const toSave = [...salaryChecked].filter(id => {
      const val = parseFloat(salaryDrafts[id] ?? '');
      return !isNaN(val) && val >= 0;
    });
    if (toSave.length === 0) { setShowSalaryModal(false); return; }
    setSalarySaving(true);
    let saved = false;
    try {
      await Promise.all(toSave.map(id => setCourierSalary(token, id, parseFloat(salaryDrafts[id]))));
      // Apply the just-saved salaries immediately so the gated action below can resume
      // without waiting on a round trip.
      patchOrders(toSave, o => ({ ...o, courierSalary: parseFloat(salaryDrafts[o.id]) }),
        filterUnpriced ? o => !isStillUnpriced(o) : undefined);
      saved = true;
    } catch { /* best-effort */ }
    setSalarySaving(false);
    setShowSalaryModal(false);
    showToast(t.aopSalarySetToast(toSave.length));
    // Resume the action that opened this modal — the gating re-checks against the freshly
    // patched orders, so it commits when nothing is missing or re-prompts otherwise.
    if (saved) setResumeAction(bulkMode === 'deliver' ? 'deliver' : 'assign');
    // Reconcile totals/pagination in the background — never blocks the resumed action above.
    loadSilent();
    void unpricedQuery.refetch();
  };

  const handlePriceSave = async () => {
    const toSave = [...priceChecked].filter(id => {
      const val = parseFloat(priceDrafts[id] ?? '');
      return !isNaN(val) && val >= 0;
    });
    if (toSave.length === 0) { setShowPriceModal(false); return; }
    setPriceSaving(true);
    let saved = false;
    try {
      await Promise.all(toSave.map(id => setCompanyServicePrice(token, id, parseFloat(priceDrafts[id]))));
      patchOrders(toSave, o => ({ ...o, companyServicePrice: parseFloat(priceDrafts[o.id]) }),
        filterUnpriced ? o => !isStillUnpriced(o) : undefined);
      saved = true;
    } catch { /* best-effort */ }
    setPriceSaving(false);
    setShowPriceModal(false);
    showToast(t.aopPriceSetToast(toSave.length));
    // Resume the original action — it advances to the salary step (or commits) without a
    // second click. Re-checks gating against the freshly patched orders.
    if (saved) setResumeAction(bulkMode === 'deliver' ? 'deliver' : 'assign');
    loadSilent();
    void unpricedQuery.refetch();
  };

  // Resume the assign/deliver action after a price/salary save, once the reload has
  // settled and no gating dialog is open. Re-running the entry handler re-evaluates the
  // gating against the fresh data: it commits when nothing is missing, or re-prompts for
  // whatever is still missing (e.g. salary right after prices). Driven by the freshly
  // saved data, so the admin never has to click "Assign"/"Mark delivered" a second time.
  useEffect(() => {
    if (!resumeAction) return;
    if (loading || showSalaryWarning || showSalaryModal || showPriceWarning || showPriceModal) return;
    const action = resumeAction;
    setResumeAction(null);
    if (action === 'deliver') void handleBulkDeliver();
    else void handleBulkAssign();
  // handleBulkAssign/handleBulkDeliver are stable enough; re-running only when the gating
  // state changes is what we want here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAction, loading, showSalaryWarning, showSalaryModal, showPriceWarning, showPriceModal]);

  const hasActiveFilters = filterCity || filterDistrict || debouncedSearch || filterCourier || filterUnpriced;
  const clearAll = () => {
    setFilterCity(''); setFilterDistrict('');
    setDebouncedSearch(''); setSearchResetKey(k => k + 1);
    setFilterCourier(null); setFilterUnpriced(false);
  };

  // Renders a single order row — shared by the flat (Recipient) view and, nested under a
  // sender group header, the grouped (Sender) view.
  const renderOrderRow = (order: AdminOrderItem) => {
    const isChecked       = selected.has(order.id);
    const [bg, color]     = STATUS_COLORS[order.status] ?? ['rgba(160,120,0,0.12)', '#c4870f'];
    const statusMeta      = getStatusMeta(order.status, lang);
    const missingPrice    = order.companyServicePrice === 0;
    const missingSalary   = order.courierSalary == null || order.courierSalary === 0;
    const selectable      = bulkMode === 'assign'  ? isAssignable(order)
                          : bulkMode === 'deliver' ? isDeliverable(order)
                          : true;
    return (
      <tr key={order.id}
        className={`aop-tr${isChecked ? ' aop-tr--selected' : ''}${!selectable ? ' aop-tr--disabled' : ''}`}
        onClick={() => canManage && selectable && toggleOne(order.id)}
        style={!canManage || !selectable ? { cursor: 'default' } : undefined}
      >
        {canManage && (
          <td className="aop-td aop-td--check" onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="aop-checkbox" checked={isChecked}
              disabled={!selectable}
              onChange={() => selectable && toggleOne(order.id)}/>
          </td>
        )}
        {showTracking && (
          <td className="aop-td">
            <span className="tn-badge">{order.trackingNumber}</span>
          </td>
        )}
        <td className="aop-td">
          <div className="aop-sender-biz">{order.senderBusinessName}</div>
          <div className="aop-sender-name">{order.senderFirstName} {order.senderLastName}</div>
        </td>
        <td className="aop-td">
          <div className="aop-name">{recipientDisplayName(order.recipientName, t.recipientUnknown)}</div>
          <PhoneActions phone={order.recipientPhone} />
          <div className="aop-addr">{pickupAddressDisplay(order)}</div>
        </td>
        <td className="aop-td">
          <div className="aop-city">{pickupCityDisplay(order, lang)}</div>
          <div className="aop-district">{pickupDistrictDisplay(order, lang)}</div>
        </td>
        <td className="aop-td">
          <span
            className="status-badge"
            style={{ background: bg, color }}
            title={statusMeta.description}
          >
            {statusMeta.short}
          </span>
          <div className="aop-courier-name" title={order.courierFullName ?? t.vomUnassigned}
            style={order.courierId ? undefined : { color: '#ef4444' }}>
            {order.courierFullName ?? t.vomUnassigned}
          </div>
          {/* Delivered time — shown on delivered (Assigned-tab) orders. */}
          {order.deliveredAt && (
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
              {t.aopDeliveredAt} · {fmtDateTime(order.deliveredAt, lang)}
            </div>
          )}
          {order.status === 'DeliveryPostponed' && order.postponeReason && (
            <div style={{ fontSize: '0.7rem', color: '#f97316', marginTop: 2 }}>
              {t.cdPostponeReasons[order.postponeReason]}
              {order.postponeComment && ` — ${order.postponeComment}`}
            </div>
          )}
        </td>
        <td className="aop-td aop-td--num">
          {(() => {
            // Cash the courier collects from the recipient: product COD (when
            // unpaid) + company service fee (when the recipient pays it). Shown
            // stacked — COD, + fee, = total — when both apply. Operators (no
            // canManage) must not see the service fee, so they get the total only.
            const cod = order.productPaymentStatus === 'NotPaid' ? (order.amountToCollectForPackage ?? 0) : 0;
            const fee = order.whoPaysForCompanyService === 'Recipient' ? (order.companyServicePrice ?? 0) : 0;
            const total = cod + fee;
            if (total <= 0) return <span className="aop-price aop-price--empty">—</span>;
            if (!canManage || !(cod > 0 && fee > 0)) return <span className="aop-price">₾{total.toFixed(2)}</span>;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3, alignItems: 'flex-end' }}>
                <span className="aop-price">{t.goCodLbl} ₾{cod.toFixed(2)}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--color-text-subtle)' }}>{t.goFeeLbl} ₾{fee.toFixed(2)}</span>
                <span className="aop-price" style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 1, marginTop: 1 }}>{t.goTotalLbl} ₾{total.toFixed(2)}</span>
              </div>
            );
          })()}
        </td>
        {showPricesEff && (
          <td className="aop-td aop-td--num">
            {missingPrice
              ? <span className="aop-missing">{t.aopNotSet}</span>
              : <span className="aop-price">₾{order.companyServicePrice.toFixed(2)}</span>
            }
          </td>
        )}
        {showPricesEff && (
          <td className="aop-td aop-td--num">
            {missingSalary
              ? <span className="aop-missing">{t.aopNotSet}</span>
              : <span className="aop-price">₾{order.courierSalary!.toFixed(2)}</span>
            }
          </td>
        )}
        {showRevenueEff && (
          <td className="aop-td aop-td--num">
            {order.companyRevenue != null
              ? <span className="aop-price">₾{order.companyRevenue.toFixed(2)}</span>
              : <span className="aop-price aop-price--empty">—</span>
            }
          </td>
        )}
        <td className="aop-td">
          {order.productPaymentStatus === 'Paid'
            ? <span className="aop-paid">{t.aopPaid}</span>
            : <span className="aop-unpaid">{t.aopUnpaid}</span>
          }
        </td>
        <td className="aop-td aop-td--actions" onClick={e => e.stopPropagation()}>
          <OrderRowActionsMenu
            order={order}
            couriers={couriers}
            token={token ?? ''}
            canManage={canManage}
            canAssign={isAssignable(order)}
            canDeliver={isDeliverable(order)}
            onView={() => setViewingOrder(order)}
            onEdit={() => setEditingOrder(order)}
            onLabel={() => void printParcelLabels([buildAdminLabel(order)])}
            onChanged={reload}
            onAssigned={(courierId, newStatus) => {
              // Mirrors doAssign's bulk optimistic patch below — instant row update instead of
              // waiting on onChanged()'s reload for a single-row (re)assignment.
              const assignedCourier = couriers.find(c => c.courierId === courierId);
              const defaultSalary = assignedCourier?.defaultSalary ?? null;
              patchOrders([order.id], o => ({
                ...o,
                courierId,
                courierFullName: assignedCourier?.fullName ?? o.courierFullName,
                status: newStatus,
                ...(o.orderType !== 'Return' && defaultSalary != null
                  ? { courierSalary: defaultSalary, companyRevenue: o.companyServicePrice - defaultSalary }
                  : {}),
              }), assignTab === 'pending' ? () => true : undefined);
            }}
            onError={msg => showToast(msg, 'err')}
          />
        </td>
      </tr>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="aop-root" ref={aopRootRef}>

      {/* Day navigator — last 7 days by default; pick a day, step with the arrows, or choose
          a custom inclusive range to filter packages by the day they were placed (CreatedAt). */}
      <DateRangeNav
        from={selectedDate}
        to={rangeEnd}
        onChange={(f, to) => { setDateTouched(true); setSelectedDate(f); setRangeEnd(to); }}
        classPrefix="aop-daynav"
      />

      {/* Pending Assign / Assigned tabs + column toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="go-seg">
          <button
            className={`go-seg__btn${assignTab === 'pending' ? ' go-seg__btn--active' : ''}`}
            onClick={() => setAssignTab('pending')}
          >
            {t.aopTabPendingAssign}
          </button>
          <button
            className={`go-seg__btn${assignTab === 'assigned' ? ' go-seg__btn--active' : ''}`}
            onClick={() => setAssignTab('assigned')}
          >
            {t.aopTabAssigned}
          </button>
        </div>

        <label className="aop-col-toggle">
          <input type="checkbox" checked={showTracking} onChange={e => setShowTracking(e.target.checked)} />
          {t.aopShowTracking}
        </label>
        {canManage && (
          <label className="aop-col-toggle">
            <input type="checkbox" checked={showPrices} onChange={e => setShowPrices(e.target.checked)} />
            {t.aopShowPrices}
          </label>
        )}
      </div>

      {/* Toolbar */}
      <div className="aop-toolbar">
        <DebouncedSearchBox
          key={searchResetKey}
          onChange={setDebouncedSearch}
          placeholder={t.aopSearchPh}
          debounceMs={300}
          minChars={MIN_SEARCH_CHARS}
          minCharsHint={t.goSearchMinChars}
        />

        <CourierPicker
          couriers={couriers}
          selected={filterCourier}
          onSelect={setFilterCourier}
        />

        <div className="go-select-wrap">
          <svg className="go-select-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 11c0 0 5 3.5 5 5H3c0-1.5 5-5 5-5z" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
          <select className="go-select" value={filterCity}
            onChange={e => { setFilterCity(e.target.value); setFilterDistrict(''); }}>
            <option value="">{t.aopAllCities}</option>
            {cities.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <svg className="go-select-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        <div className="go-select-wrap">
          <select className="go-select" value={filterDistrict} disabled={!filterCity}
            onChange={e => setFilterDistrict(e.target.value)}>
            <option value="">{t.aopAllDistricts}</option>
            {districts.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <svg className="go-select-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        <button
          className={`aop-unpriced-btn${filterUnpriced ? ' aop-unpriced-btn--active' : ''}`}
          onClick={() => setFilterUnpriced(v => !v)}
          title={t.aopUnpricedTitle}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {t.aopUnpriced}
          {unpricedCount !== null && unpricedCount > 0 && (
            <span className={`aop-unpriced-badge${filterUnpriced ? ' aop-unpriced-badge--active' : ''}`}>
              {unpricedCount}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button className="go-clear-btn" onClick={clearAll}>{t.aopClearFilters}</button>
        )}

        {/* Always-available Mark-Delivered entry: click to enter the mode (then deliverable
            orders become selectable), click again or press Esc to exit. */}
        {canManage && (
          <button
            className={`aop-unpriced-btn${bulkMode === 'deliver' ? ' aop-unpriced-btn--active' : ''}`}
            onClick={() => {
              if (bulkMode === 'deliver') { setBulkMode('assign'); setSelected(new Set()); setBulkCourierId(''); }
              else setBulkMode('deliver');
            }}
            style={{ marginLeft: 'auto' }}
            title={t.aopModeDeliver}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 8.5l3.5 3.5L14 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.aopModeDeliver}
          </button>
        )}

        {canManage && (
          <button
            className="aop-export-btn"
            onClick={handleExport}
            disabled={exporting || loading}
            title={t.aopExportTitle}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v9M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {exporting ? t.aopExporting : (selected.size > 0 ? t.aopExportSelected(selected.size) : t.aopExportExcel)}
          </button>
        )}

        <span className="go-count">
          {data ? t.aopOrderCount(data.totalCount) : ''}
        </span>
      </div>

      {/* Active courier banner */}
      {filterCourier && (
        <div className="aop-courier-banner">
          <span className="aop-courier-banner__avatar">{initials(filterCourier.fullName)}</span>
          <div className="aop-courier-banner__info">
            <span className="aop-courier-banner__name">{filterCourier.fullName}</span>
            <span className="aop-courier-banner__meta">
              {filterCourier.assignedCity}, {filterCourier.assignedDistrict} · {filterCourier.phoneNumber}
            </span>
          </div>
          {filterUnpriced && unpricedCount !== null && (
            <span className="aop-courier-banner__unpriced">
              {t.aopMissingFinancials(unpricedCount)}
            </span>
          )}
          <button
            className="aop-courier-banner__clear"
            onClick={() => setFilterCourier(null)}
            title={t.aopClearCourierTitle}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Mode toggle + bulk action bar — Admin only (read-only Operators can't select).
          Also shown while in Mark-Delivered mode even before anything is selected. */}
      {canManage && (someSelected || bulkMode === 'deliver') && (
        <div className="aop-bulk-bar" ref={bulkBarRef}>
          {/* Mode segmented switch */}
          <div className="go-seg" style={{ flexShrink: 0 }}>
            <button
              className={`go-seg__btn${bulkMode === 'assign' ? ' go-seg__btn--active' : ''}`}
              onClick={() => setBulkMode('assign')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {t.aopModeAssign}
            </button>
            <button
              className={`go-seg__btn${bulkMode === 'prices' ? ' go-seg__btn--active' : ''}`}
              onClick={() => setBulkMode('prices')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 4.5v1M8 10.5v1M5.5 8c0-.83.67-1.5 1.5-1.5h2a1 1 0 010 2H7a1 1 0 000 2h2c.83 0 1.5-.67 1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {t.aopModePrices}
            </button>
            <button
              className={`go-seg__btn${bulkMode === 'deliver' ? ' go-seg__btn--active' : ''}`}
              onClick={() => setBulkMode('deliver')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 8.5l3.5 3.5L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t.aopModeDeliver}
            </button>
          </div>

          {/* Print labels for the selected orders — third bulk action. */}
          <button
            type="button"
            className="aop-bulk-btn aop-bulk-btn--ghost"
            onClick={handlePrintLabels}
            title={t.aopPrintLabelsTitle}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 6V2.5h7V6M4.5 11.5h-1A1.5 1.5 0 0 1 2 10V8a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 8v2a1.5 1.5 0 0 1-1.5 1.5h-1M4.5 9.5h7v4h-7z"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.aopPrintLabels}
          </button>

          <span className="aop-bulk-count">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 8l2.5 2.5L11 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.aopNSelected(selected.size)}
          </span>

          {/* Assign Courier mode */}
          {bulkMode === 'assign' && (
            <>
              <div className="go-select-wrap">
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
                  <option value="">{t.aopChooseCourierOpt}</option>
                  {couriers.filter(c => !c.isDeleted).map(c => (
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
                className="aop-bulk-btn aop-bulk-btn--salary"
                disabled={!bulkCourierId || bulkAssigning}
                onClick={handleBulkAssign}
              >
                {bulkAssigning ? t.aopAssigning : t.aopAssignToN(selected.size)}
              </button>
            </>
          )}

          {/* Set Prices mode */}
          {bulkMode === 'prices' && (
            <>
              {!showBulkModal ? (
                <button className="aop-bulk-btn aop-bulk-btn--price" onClick={() => setShowBulkModal(true)}>
                  {t.aopSetPrices}
                </button>
              ) : (
                <div className="aop-bulk-input-row">
                  <span className="aop-bulk-label">{t.aopBulkSvcLabel}</span>
                  <div className="aop-bulk-input-wrap">
                    <span className="aop-bulk-currency">₾</span>
                    <input
                      className="aop-bulk-input"
                      type="number" min="0" step="0.01" placeholder={t.aopUnchangedPh}
                      value={bulkPrice} autoFocus
                      onChange={e => setBulkPrice(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') cancelBulk(); }}
                    />
                  </div>
                  <span className="aop-bulk-label" style={{ marginLeft: 8 }}>{t.aopBulkSalLabel}</span>
                  <div className="aop-bulk-input-wrap">
                    <span className="aop-bulk-currency">₾</span>
                    <input
                      className="aop-bulk-input"
                      type="number" min="0" step="0.01" placeholder={t.aopUnchangedPh}
                      value={bulkSalary}
                      onChange={e => setBulkSalary(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleBulkApply(); if (e.key === 'Escape') cancelBulk(); }}
                    />
                  </div>
                  <button className="aop-bulk-btn aop-bulk-btn--apply"
                    disabled={bulkBusy || (!bulkPrice && !bulkSalary)} onClick={handleBulkApply}>
                    {bulkBusy ? t.aopSaving : t.aopApply}
                  </button>
                  <button className="aop-bulk-btn aop-bulk-btn--ghost"
                    disabled={bulkBusy} onClick={cancelBulk}>
                    {t.cancel}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Mark Delivered mode */}
          {bulkMode === 'deliver' && (
            <>
              {/* Courier picker — only needed when a selected order has no courier yet. */}
              {missingCourierOrders.length > 0 && (
                <div className="go-select-wrap">
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
                    <option value="">{t.aopCourierForUnassigned}</option>
                    {couriers.filter(c => !c.isDeleted).map(c => (
                      <option key={c.courierId} value={c.courierId}>
                        {c.fullName} — {c.assignedCity}, {c.assignedDistrict}
                      </option>
                    ))}
                  </select>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron">
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <button
                className="aop-bulk-btn aop-bulk-btn--deliver"
                disabled={bulkDelivering || actionPool.length === 0}
                onClick={handleBulkDeliver}
              >
                {bulkDelivering
                  ? t.aopMarking
                  : t.aopMarkNDelivered(actionPool.length)}
              </button>
            </>
          )}

          <button
            className="aop-bulk-btn aop-bulk-btn--ghost"
            onClick={() => setSelected(new Set())}
            style={{ marginLeft: 'auto' }}
          >
            {t.aopDeselectAll}
          </button>
        </div>
      )}

      {/* Salary warning */}
      {showSalaryWarning && (
        <SalaryWarningModal
          orderCount={missingSalaryOrders.length}
          onCancel={() => setShowSalaryWarning(false)}
          onFillSalaries={() => { setShowSalaryWarning(false); setShowSalaryModal(true); }}
        />
      )}

      {/* Service-price warning */}
      {showPriceWarning && (
        <PriceWarningModal
          orderCount={missingPriceOrders.length}
          onCancel={() => setShowPriceWarning(false)}
          onFillPrices={() => { setShowPriceWarning(false); setShowPriceModal(true); }}
        />
      )}

      {/* Salary modal portal */}
      {showSalaryModal && createPortal((() => {
        const allChecked = missingSalaryOrders.length > 0 && missingSalaryOrders.every(o => salaryChecked.has(o.id));
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 740, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>{t.aopSetSalary}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{t.aopMissingSalaryCount(missingSalaryOrders.length)}</div>
                </div>
                <button onClick={() => setShowSalaryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </button>
              </div>
              {/* Bulk apply banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 12, background: 'var(--color-accent-dim)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{salaryChecked.size > 0 ? t.aopApplyToSel(salaryChecked.size) : t.aopApplyToAll}</span>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-2)' }}>
                  <span style={{ padding: '0 6px 0 10px', fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>₾</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" id="bulk-salary-input-pkg"
                    style={{ flex: 1, minWidth: 0, padding: '6px 8px 6px 2px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: '0.88rem' }} />
                </div>
                <button onClick={() => {
                  const inp = document.getElementById('bulk-salary-input-pkg') as HTMLInputElement;
                  const val = inp?.value; if (!val) return;
                  const targets = salaryChecked.size > 0 ? [...salaryChecked] : missingSalaryOrders.map(o => o.id);
                  setSalaryDrafts(prev => { const next = { ...prev }; targets.forEach(id => { next[id] = val; }); return next; });
                  setSalaryChecked(prev => { const next = new Set(prev); targets.forEach(id => next.add(id)); return next; });
                  inp.value = '';
                }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', flexShrink: 0, background: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.aopApplyValue}</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                <input type="checkbox" style={{ cursor: 'pointer' }} checked={allChecked}
                  onChange={e => setSalaryChecked(e.target.checked ? new Set(missingSalaryOrders.map(o => o.id)) : new Set())} />
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopSelectAllN(missingSalaryOrders.length)}</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ width: 28, padding: '6px 4px' }}></th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThTracking}</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopColAddress}</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSvcPrice}</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSalary}</th>
                      {canSeeRevenue && <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThRevenue}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {missingSalaryOrders.map(o => {
                      const salary = parseFloat(salaryDrafts[o.id] ?? '');
                      const revenue = !isNaN(salary) ? o.companyServicePrice - salary : null;
                      const isChecked = salaryChecked.has(o.id);
                      return (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)', background: isChecked ? 'var(--color-accent-dim)' : 'var(--color-bg-2)' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            <input type="checkbox" style={{ cursor: 'pointer' }} checked={isChecked}
                              onChange={() => setSalaryChecked(prev => { const next = new Set(prev); isChecked ? next.delete(o.id) : next.add(o.id); return next; })} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span className="tn-badge">{o.trackingNumber}</span>
                            {o.senderBusinessName && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 3 }}>{o.senderBusinessName}</div>}
                          </td>
                          <td style={{ padding: '6px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{pickupCityDisplay(o, lang)}, {pickupDistrictDisplay(o, lang)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{pickupAddressDisplay(o)}</div>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text)' }}>₾{o.companyServicePrice.toFixed(2)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>₾</span>
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={salaryDrafts[o.id] ?? ''}
                                onChange={e => { setSalaryDrafts(prev => ({ ...prev, [o.id]: e.target.value })); if (e.target.value) setSalaryChecked(prev => { const n = new Set(prev); n.add(o.id); return n; }); }}
                                style={{ width: 72, textAlign: 'right', padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.83rem' }} />
                            </div>
                          </td>
                          {canSeeRevenue && (
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                            {revenue !== null ? <span style={{ color: revenue >= 0 ? '#10b981' : '#ef4444' }}>₾{revenue.toFixed(2)}</span> : <span style={{ color: 'var(--color-text-subtle)' }}>—</span>}
                          </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <button onClick={() => setShowSalaryModal(false)} disabled={salarySaving}
                  style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.close}</button>
                <button onClick={handleSalarySave} disabled={salarySaving || salaryChecked.size === 0}
                  style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (salarySaving || salaryChecked.size === 0) ? 0.6 : 1 }}>
                  {salarySaving ? t.aopSaving : t.aopSaveWithCount(salaryChecked.size)}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Service-price modal portal */}
      {showPriceModal && createPortal((() => {
        const allChecked = missingPriceOrders.length > 0 && missingPriceOrders.every(o => priceChecked.has(o.id));
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>{t.aopSetPrice}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{t.aopMissingPriceCount(missingPriceOrders.length)}</div>
                </div>
                <button onClick={() => setShowPriceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </button>
              </div>
              {/* Bulk apply banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 12, background: 'var(--color-accent-dim)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{priceChecked.size > 0 ? t.aopApplyToSel(priceChecked.size) : t.aopApplyToAll}</span>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-2)' }}>
                  <span style={{ padding: '0 6px 0 10px', fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>₾</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" id="bulk-price-input-pkg"
                    style={{ flex: 1, minWidth: 0, padding: '6px 8px 6px 2px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: '0.88rem' }} />
                </div>
                <button onClick={() => {
                  const inp = document.getElementById('bulk-price-input-pkg') as HTMLInputElement;
                  const val = inp?.value; if (!val) return;
                  const targets = priceChecked.size > 0 ? [...priceChecked] : missingPriceOrders.map(o => o.id);
                  setPriceDrafts(prev => { const next = { ...prev }; targets.forEach(id => { next[id] = val; }); return next; });
                  setPriceChecked(prev => { const next = new Set(prev); targets.forEach(id => next.add(id)); return next; });
                  inp.value = '';
                }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', flexShrink: 0, background: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.aopApplyValue}</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                <input type="checkbox" style={{ cursor: 'pointer' }} checked={allChecked}
                  onChange={e => setPriceChecked(e.target.checked ? new Set(missingPriceOrders.map(o => o.id)) : new Set())} />
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopSelectAllN(missingPriceOrders.length)}</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ width: 28, padding: '6px 4px' }}></th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThTracking}</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopColAddress}</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSvcPrice}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingPriceOrders.map(o => {
                      const isChecked = priceChecked.has(o.id);
                      return (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)', background: isChecked ? 'var(--color-accent-dim)' : 'var(--color-bg-2)' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            <input type="checkbox" style={{ cursor: 'pointer' }} checked={isChecked}
                              onChange={() => setPriceChecked(prev => { const next = new Set(prev); isChecked ? next.delete(o.id) : next.add(o.id); return next; })} />
                          </td>
                          <td style={{ padding: '6px 8px' }}><span className="tn-badge">{o.trackingNumber}</span></td>
                          <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{pickupCityDisplay(o, lang)}, {pickupDistrictDisplay(o, lang)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{pickupAddressDisplay(o)}</div>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>₾</span>
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={priceDrafts[o.id] ?? ''}
                                onChange={e => { setPriceDrafts(prev => ({ ...prev, [o.id]: e.target.value })); if (e.target.value) setPriceChecked(prev => { const n = new Set(prev); n.add(o.id); return n; }); }}
                                style={{ width: 72, textAlign: 'right', padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.83rem' }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <button onClick={() => setShowPriceModal(false)} disabled={priceSaving}
                  style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.close}</button>
                <button onClick={handlePriceSave} disabled={priceSaving || priceChecked.size === 0}
                  style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (priceSaving || priceChecked.size === 0) ? 0.6 : 1 }}>
                  {priceSaving ? t.aopSaving : t.aopSaveWithCount(priceChecked.size)}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Table */}
      <div className="aop-table-wrap">
        {loading && (
          <div className="go-loading"><div className="go-spinner"/>{t.aopLoadingOrders}</div>
        )}
        {!loading && error && (
          <div className="go-error">{error}</div>
        )}
        {!loading && !error && orders.length === 0 && (
          <div className="go-loading" style={{ color: 'var(--color-text-subtle)' }}>
            {filterUnpriced ? t.aopAllPriced : t.aopNoOrdersMatch}
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <table className="aop-table">
            <thead>
              <tr>
                {canManage && (
                  <th className="aop-th aop-th--check">
                    <input type="checkbox" className="aop-checkbox" checked={allSelected} disabled={selectAllBusy}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      title={allSelected ? t.aopDeselectAll : t.aopSelectAll}
                    />
                  </th>
                )}
                {showTracking && <th className="aop-th">{t.aopThTracking}</th>}
                <th className="aop-th">{t.aopThSender}</th>
                <th className="aop-th">{t.aopThRecipient}</th>
                <th className="aop-th">{t.aopThCityDistrict}</th>
                <th className="aop-th">{t.aopThStatus}</th>
                <th className="aop-th aop-th--num">{t.aopThCod}</th>
                {showPricesEff && <th className="aop-th aop-th--num">{t.aopThSvcPrice}</th>}
                {showPricesEff && <th className="aop-th aop-th--num">{t.aopThSalary}</th>}
                {showRevenueEff && <th className="aop-th aop-th--num">{t.aopThRevenue}</th>}
                <th className="aop-th">{t.aopThPaid}</th>
                <th className="aop-th">{t.aopThActions}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => renderOrderRow(order))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="aop-pagination">
          <button className="aop-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t.aopPrevPage}
          </button>
          <span className="aop-page-info">{t.aopPageInfo(data.page, data.totalPages)}</span>
          <button className="aop-page-btn" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
            {t.aopNextPage}
          </button>
        </div>
      )}

      {/* View order modal */}
      <ViewOrderModal
        order={viewingOrder}
        open={viewingOrder !== null}
        onClose={() => setViewingOrder(null)}
        showFinancials={canManage}
        showRevenue={canSeeRevenue}
      />

      {/* Edit order modal */}
      <EditOrderModal
        order={editingOrder}
        open={editingOrder !== null}
        onClose={() => setEditingOrder(null)}
        onSaved={async () => {
          setEditingOrder(null);
          await mainQuery.refetch();
        }}
        token={token}
        canMarkDelivered={editingOrder != null && !['DeliveredToRecipient','ExchangeCompleted','DeliveredReturnOrderToWarehouse','ReturnedToSender','CancelledByAdmin','CancelledBySender','OrderNotAccepted','AllDelivered'].includes(editingOrder.status) && editingOrder.orderType !== 'Return'}
        canMarkWarehouse={editingOrder != null && !['DeliveredToRecipient','ExchangeCompleted','DeliveredReturnOrderToWarehouse','ReturnedToSender','CancelledByAdmin','CancelledBySender','OrderNotAccepted','AllDelivered'].includes(editingOrder.status) && editingOrder.orderType === 'Return'}
        couriers={couriers}
        canSeeRevenue={canSeeRevenue}
        onActioned={async () => {
          await mainQuery.refetch();
        }}
      />

      {/* Toast */}
      {toast && (
        <div className={`action-toast${toast.type === 'err' ? ' action-toast--err' : ''}`}>
          {toast.type === 'ok'
            ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          }
          {toast.msg}
        </div>
      )}

      <style>{`
        .aop-root { display: flex; flex-direction: column; min-height: 0; }

        /* ── Day navigator (mirrors Pick-Up page) ── */
        .aop-daynav { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
        .aop-daynav__arrow { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); cursor: pointer; transition: all var(--transition); }
        .aop-daynav__arrow:hover:not(:disabled) { background: var(--color-bg-3); border-color: var(--color-text-subtle); }
        .aop-daynav__arrow:disabled { opacity: 0.4; cursor: not-allowed; }
        .aop-daynav__date { background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.85rem; font-weight: 600; padding: 5px 8px; outline: none; font-family: inherit; }
        .aop-daynav__label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.92rem; font-weight: 700; color: var(--color-text); }
        .aop-daynav__today { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-accent); background: var(--color-accent-dim); border-radius: 100px; padding: 2px 8px; }
        .aop-daynav__jump { margin-left: 4px; background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.76rem; font-weight: 600; padding: 6px 12px; cursor: pointer; transition: all var(--transition); }
        .aop-daynav__jump:hover { background: var(--color-bg-3); color: var(--color-text); }

        /* ── Column toggles ── */
        .aop-col-toggle {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.78rem; font-weight: 600; color: var(--color-text-subtle);
          cursor: pointer; user-select: none; white-space: nowrap;
          padding: 6px 10px; border-radius: var(--radius-sm);
          border: 1px solid var(--color-border); background: var(--color-bg-3);
          transition: all var(--transition);
        }
        .aop-col-toggle:hover { color: var(--color-text); border-color: var(--color-text-subtle); }
        .aop-col-toggle input[type="checkbox"] { width: 13px; height: 13px; cursor: pointer; accent-color: var(--color-accent); margin: 0; }

        /* ── Toolbar ── */
        .aop-toolbar {
          display: flex; align-items: center; gap: 10px; padding: 12px 20px;
          border-bottom: 1px solid var(--color-border); flex-wrap: wrap;
          background: var(--color-bg);
        }

        /* ── Courier picker ── */
        .cp-root { position: relative; }
        .cp-trigger {
          display: flex; align-items: center; gap: 7px;
          background: var(--color-bg-3); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); color: var(--color-text-subtle);
          font-size: 0.8rem; font-weight: 500; padding: 7px 12px;
          cursor: pointer; transition: all var(--transition); white-space: nowrap;
          max-width: 240px;
        }
        .cp-trigger:hover { color: var(--color-text); border-color: var(--color-text-subtle); }
        .cp-trigger--active {
          background: rgba(59,130,246,0.08);
          border-color: rgba(59,130,246,0.4); color: #3b82f6;
        }
        .cp-avatar {
          width: 22px; height: 22px; border-radius: 50%;
          background: #3b82f6; color: #fff;
          font-size: 0.62rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .cp-trigger-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
        .cp-trigger-city { font-size: 0.74rem; opacity: 0.75; }
        .cp-chevron { margin-left: auto; flex-shrink: 0; }
        .cp-clear {
          margin-left: 2px; display: flex; align-items: center;
          padding: 2px; border-radius: 3px; flex-shrink: 0;
          cursor: pointer; opacity: 0.6;
        }
        .cp-clear:hover { opacity: 1; }

        .cp-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; z-index: 100;
          width: 280px; background: var(--color-bg-2);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          animation: expand-in 0.12s ease both;
        }
        .cp-search-wrap {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; border-bottom: 1px solid var(--color-border);
          color: var(--color-text-subtle);
        }
        .cp-search {
          flex: 1; background: none; border: none; outline: none;
          color: var(--color-text); font-size: 0.82rem;
        }
        .cp-search::placeholder { color: var(--color-text-subtle); }
        .cp-search-clear {
          background: none; border: none; cursor: pointer;
          color: var(--color-text-subtle); padding: 0; display: flex;
        }
        .cp-search-clear:hover { color: var(--color-text); }
        .cp-list { max-height: 260px; overflow-y: auto; padding: 4px; }
        .cp-item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          background: none; border: none; border-radius: var(--radius-sm);
          padding: 8px 10px; cursor: pointer; text-align: left;
          transition: background var(--transition);
        }
        .cp-item:hover { background: var(--color-bg-3); }
        .cp-item--active { background: rgba(59,130,246,0.08); }
        .cp-item-all-icon {
          width: 28px; height: 28px; border-radius: 50%;
          background: var(--color-bg-3); border: 1px solid var(--color-border);
          display: flex; align-items: center; justify-content: center;
          color: var(--color-text-subtle); flex-shrink: 0;
        }
        .cp-item-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: #3b82f6; color: #fff;
          font-size: 0.65rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .cp-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .cp-item-name { font-size: 0.82rem; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cp-item-meta { font-size: 0.72rem; color: var(--color-text-subtle); }
        .cp-item-check { margin-left: auto; color: #3b82f6; flex-shrink: 0; }
        .cp-empty { font-size: 0.78rem; color: var(--color-text-subtle); text-align: center; padding: 16px 10px; }

        /* ── Courier banner ── */
        .aop-courier-banner {
          display: flex; align-items: center; gap: 12px; padding: 10px 20px;
          background: rgba(59,130,246,0.06); border-bottom: 1px solid rgba(59,130,246,0.2);
          animation: expand-in 0.15s ease both;
        }
        .aop-courier-banner__avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: #3b82f6; color: #fff;
          font-size: 0.7rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .aop-courier-banner__info { display: flex; flex-direction: column; gap: 1px; }
        .aop-courier-banner__name { font-size: 0.875rem; font-weight: 700; color: var(--color-text); }
        .aop-courier-banner__meta { font-size: 0.75rem; color: var(--color-text-subtle); }
        .aop-courier-banner__unpriced {
          margin-left: 8px; font-size: 0.75rem; font-weight: 600;
          background: rgba(239,68,68,0.1); color: #ef4444;
          border-radius: 100px; padding: 3px 10px;
        }
        .aop-courier-banner__clear {
          margin-left: auto; background: none; border: none;
          cursor: pointer; color: var(--color-text-subtle);
          padding: 4px; border-radius: var(--radius-sm);
          display: flex; align-items: center;
          transition: color var(--transition);
        }
        .aop-courier-banner__clear:hover { color: var(--color-text); }

        /* ── Unpriced toggle ── */
        .aop-unpriced-btn {
          display: flex; align-items: center; gap: 7px;
          background: var(--color-bg-3); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); color: var(--color-text-subtle);
          font-size: 0.8rem; font-weight: 600; padding: 7px 13px;
          cursor: pointer; transition: all var(--transition); white-space: nowrap;
        }
        .aop-unpriced-btn:hover:not(.aop-unpriced-btn--active) {
          color: var(--color-text); border-color: var(--color-text-subtle);
        }
        .aop-unpriced-btn--active {
          background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444;
        }
        .aop-unpriced-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 18px; padding: 0 5px;
          background: #ef4444; color: #fff;
          border-radius: 100px; font-size: 0.68rem; font-weight: 700; line-height: 1;
        }
        .aop-unpriced-badge--active { background: #fff; color: #ef4444; }

        /* ── Export button ── */
        .aop-export-btn {
          display: inline-flex; align-items: center; gap: 7px;
          background: #16a34a; border: 1px solid #16a34a; color: #fff;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          padding: 7px 13px; cursor: pointer; transition: opacity var(--transition); white-space: nowrap;
        }
        .aop-export-btn:hover:not(:disabled) { opacity: 0.9; }
        .aop-export-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Bulk bar ── */
        .aop-bulk-bar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 10px 20px;
          /* Opaque base under the translucent accent tint so list rows don't show
             through while the bar is stuck during scroll. */
          background: linear-gradient(var(--color-accent-dim), var(--color-accent-dim)), var(--color-bg);
          border-bottom: 1px solid rgba(196,127,23,0.25);
          animation: expand-in 0.15s ease both;
          /* Follow the page scroll so the action buttons stay reachable in long lists.
             Stick below the sticky StaffNav (top: nav height) so it isn't hidden behind it. */
          position: sticky; top: var(--staff-nav-h, 64px); z-index: 20;
        }
        .aop-bulk-count { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: var(--color-accent); }
        .aop-bulk-btn { border: none; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600; padding: 7px 14px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
        .aop-bulk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .aop-bulk-btn--price  { background: #8b5cf6; color: #fff; }
        .aop-bulk-btn--salary { background: #10b981; color: #fff; }
        .aop-bulk-btn--deliver { background: #16a34a; color: #fff; }
        .aop-bulk-btn--apply  { background: var(--color-accent); color: #fff; }
        .aop-bulk-btn--ghost  { background: var(--color-bg-3); border: 1px solid var(--color-border); color: var(--color-text); }
        .aop-bulk-input-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .aop-bulk-label { font-size: 0.82rem; font-weight: 600; color: var(--color-text); white-space: nowrap; }
        .aop-bulk-input-wrap { position: relative; display: flex; align-items: center; }
        .aop-bulk-currency { position: absolute; left: 10px; font-size: 0.85rem; color: var(--color-text-subtle); pointer-events: none; }
        .aop-bulk-input { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.875rem; padding: 7px 10px 7px 26px; width: 130px; outline: none; transition: border-color var(--transition); }
        .aop-bulk-input:focus { border-color: var(--color-accent); }

        /* ── Table ── */
        /* NB: no overflow on the wrap. An overflow-x:auto here would make this a
           scroll container (the spec forces overflow-y to auto too), which traps the
           sticky thead inside it so the column headers never stick to the viewport on
           page scroll. Keeping it visible lets the headers (and the bulk bar above them)
           stick to the page as intended. The table fits the admin content area; on a
           rare narrow window it simply widens the page rather than scrolling internally. */
        .aop-table-wrap { flex: 1; min-width: 0; }
        .aop-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .aop-th { text-align: left; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-subtle); padding: 10px 14px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); white-space: nowrap; position: sticky; top: calc(var(--staff-nav-h, 64px) + var(--bulk-bar-h, 0px)); z-index: 10; box-shadow: 0 1px 0 var(--color-border); }
        .aop-th--check { width: 44px; padding-left: 20px; }
        .aop-th--num { text-align: right; }
        .aop-td { padding: 11px 14px; font-size: 0.82rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); vertical-align: middle; cursor: pointer; }
        .aop-td--check { padding-left: 20px; cursor: default; width: 44px; }
        .aop-td--mono { font-family: 'Courier New', monospace; font-size: 0.78rem; }
        .aop-td--num { text-align: right; }
        .aop-td--desc { max-width: 180px; }
        .aop-tr { transition: background var(--transition); }
        .aop-tr:hover { background: var(--color-bg-3); }
        .aop-tr--selected { background: rgba(196,127,23,0.07) !important; }
        /* Dim only the data cells of non-selectable (e.g. delivered) rows — keep the
           View/Edit actions cell fully bright so it stays usable. */
        .aop-tr--disabled .aop-td:not(.aop-td--actions) { opacity: 0.7; }
        .aop-courier-name { margin-top: 3px; font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); display: flex; align-items: center; gap: 3px; max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .aop-courier-name::before { content: '→'; color: var(--color-text-subtle); }
        .aop-tr:last-child .aop-td { border-bottom: none; }
        .aop-sender-biz { font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
        .aop-sender-name { font-size: 0.75rem; color: var(--color-text-subtle); margin-top: 1px; }
        .aop-name { font-weight: 500; }
        .aop-addr { font-size: 0.75rem; color: var(--color-text-subtle); margin-top: 1px; }
        .aop-city { font-weight: 500; }
        .aop-district { font-size: 0.75rem; color: var(--color-text-subtle); margin-top: 1px; }
        .aop-fragile { display: inline-block; font-size: 0.68rem; font-weight: 700; background: rgba(249,115,22,0.12); color: #f97316; border-radius: 4px; padding: 1px 6px; margin-right: 5px; }
        .aop-price { font-weight: 600; font-variant-numeric: tabular-nums; }
        .aop-price--empty { color: var(--color-text-subtle); font-weight: 400; }
        .aop-missing { font-size: 0.73rem; font-weight: 600; color: #ef4444; background: rgba(239,68,68,0.1); border-radius: 4px; padding: 2px 7px; }
        .aop-paid   { color: #10b981; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
        .aop-unpaid { color: #ef4444; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
        .aop-td--actions { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
        .aop-checkbox { width: 15px; height: 15px; cursor: pointer; accent-color: var(--color-accent); }

        /* ── Pagination ── */
        .aop-pagination { display: flex; align-items: center; gap: 14px; justify-content: center; padding: 16px 20px; border-top: 1px solid var(--color-border); }
        .aop-page-btn { background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.82rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: background var(--transition); }
        .aop-page-btn:hover:not(:disabled) { background: var(--color-bg-2); }
        .aop-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .aop-page-info { font-size: 0.82rem; color: var(--color-text-subtle); }

        /* ── Mobile (≤768px) ── */
        @media (max-width: 768px) {
          /* On phones the wide table scrolls sideways inside its own wrapper instead
             of forcing the whole page to scroll horizontally. (The desktop reason for
             keeping this wrap non-scrolling — sticky column headers — doesn't apply on
             phones, where fitting the layout to the screen matters more.) */
          .aop-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          /* Non-sticky headers on mobile so they don't jump against the scroll box. */
          .aop-th { position: static; box-shadow: none; }
          /* Tighter side padding for narrow widths. */
          .aop-daynav { padding: 10px 14px; }
          .aop-pagination { padding: 14px; }
          .aop-toolbar, .aop-bulk-bar, .aop-courier-banner { padding-left: 14px; padding-right: 14px; }
          /* Let the courier banner wrap instead of overflowing on phones. */
          .aop-courier-banner { flex-wrap: wrap; }
          .aop-courier-banner__unpriced { margin-left: 0; }
          /* Search takes the full row so it isn't squeezed by the filter chips. */
          .aop-toolbar .go-search { flex-basis: 100%; max-width: none; }
        }
      `}</style>
    </div>
  );
}
