// ─────────────────────────────────────────────────────────────────────────────
// AdminPackagesPage — the "Packages" admin page (sidebar view `packages`, ამანათები), which
// UNITES the Pick-Up and Delivery pages into a single list. The spine is the Pick-Up
// customer-grouped accordion (it already lists every package through its whole lifecycle);
// the Delivery page's last-mile capabilities (selection, financial columns, bulk assign /
// set-prices / mark-delivered with the same price+salary gating, export, labels, courier +
// unpriced filters) are fused onto the package rows.
//
// The older AdminOrders (Pick-Up, sidebar view `orders`) and AdminOrdersPage (Delivery,
// sidebar view `delivery`) components are left as their own pages so they remain working
// recovery pages — this file duplicates rather than imports their page-level logic. Shared
// *leaf* components (AdminGroupOrderActions, AdminOrderRowActions, EditOrderModal,
// ViewOrderModal, Salary/Price warning modals) are reused by import; the small pickup-local
// helpers/modals live in ./AdminPackages (see client/CLAUDE.md §3.2).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import type { PagedResult } from '../../types/paging';
import { georgianToday, georgianDateKeyOf, toDateKey } from '../../utils/georgianTime';
import { resolveDateWindow } from '../../utils/dateWindow';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { DateRangeNav } from '../../components/ui/DateRangeNav';
import { LocationMultiPicker } from '../../components/ui/LocationMultiPicker';
import { DebouncedSearchBox } from '../../components/ui/DebouncedSearchBox';
import { PhoneActions } from '../../components/ui/PhoneActions';
import { ViewOnMapButton } from '../../components/ui/ViewOnMapButton';
import {
  fetchGroupOrders, fetchGroupOrderLocations, fetchPickupDay,
  groupAndAcceptStandalone, groupAndWarehouseStandalone,
} from '../../api/adminGroupOrders';
import type { AdminGroupOrder, AdminOrder, PickupDayCustomer } from '../../api/adminGroupOrders';
import { fetchCouriers } from '../../api/couriers';
import { fetchOrderLocations } from '../../api/orders';
import { AdminGroupOrderActions } from './AdminGroupOrderActions';
import { EditOrderModal, type CustomerServicePricing } from './EditOrderModal';
import { ViewOrderModal } from './ViewOrderModal';
import { SalaryWarningModal } from './SalaryWarningModal';
import { PriceWarningModal } from './PriceWarningModal';
import type { AdminOrderItem } from './AdminOrdersPage';
import {
  MIN_SEARCH_CHARS, ACTIVE_ORDER_STATUSES_ONLY, MERGEABLE_STATUSES, PAGE_SIZE, customerGroupKey,
  STATUS_PILLS, pickupBucket, formatDate, toOrderItem,
} from './AdminPackages/shared';
import { StatusBadge } from './AdminPackages/Badges';
import { MergeModal } from './AdminPackages/MergeModal';
import { GroupingModal } from './AdminPackages/GroupingModal';
import { PackageRow, PackageTableHead } from './AdminPackages/PackageRow';
import { BulkFieldModal } from './AdminPackages/BulkFieldModal';
import { usePackageSelection } from './AdminPackages/usePackageSelection';

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPackagesPage({ canManage = true, canAssignCourier = canManage, canGroup = canManage, canSeeRevenue = true, initialSearch = '', initialParty = 'sender' }: { canManage?: boolean; canAssignCourier?: boolean; canGroup?: boolean; canSeeRevenue?: boolean; initialSearch?: string; initialParty?: 'sender' | 'recipient' }) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;

  // ── Pickup state (mirrors AdminOrders) ──────────────────────────────────────
  // Deep-link seed from the global Order Search "Go To". With the date navigator untouched
  // and a search term present, resolveDateWindow reaches the whole DB, so the order shows
  // regardless of day.
  // The raw per-keystroke value and its debounce live inside DebouncedSearchBox — this only
  // ever sees the settled value, so typing doesn't re-render this (large) page per character.
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  // DebouncedSearchBox's initialValue only applies on mount, so "Clear filters" resets it by
  // remounting: bump searchResetKey and drop searchSeed to '' (not back to initialSearch —
  // the deep-link seed is a one-time thing, a clear should mean truly empty).
  const [searchSeed,     setSearchSeed]     = useState(initialSearch);
  const [searchResetKey, setSearchResetKey] = useState(0);
  // Server-side pagination — untouched/no-filter default is a rolling last-7-days window;
  // any filter (or an explicit day/range pick) reaches the whole DB instead.
  const [page,          setPage]          = useState(1);
  const [dateTouched,   setDateTouched]   = useState(false);
  const [filterParty,     setFilterParty]     = useState<'sender' | 'recipient'>(initialParty);
  const [filterCities,    setFilterCities]    = useState<string[]>([]);
  const [filterDistricts, setFilterDistricts] = useState<string[]>([]);
  const [filterStatus,    setFilterStatus]    = useState('');
  const [expandedIds,     setExpandedIds]     = useState<Set<string>>(new Set());
  const [actionToast,     setActionToast]     = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  // Warehouse acceptance: per-package "arrived" ticks keyed by order id. Not in this set =
  // present (default ticked); ids here were unticked = missing → cancelled as "not received".
  const [absentPkgs, setAbsentPkgs] = useState<Set<string>>(() => new Set());
  const togglePkgPresent = (orderId: string) => setAbsentPkgs(prev => {
    const next = new Set(prev);
    if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
    return next;
  });
  const [editing,         setEditing]         = useState<{ item: AdminOrderItem; pricing: CustomerServicePricing | null } | null>(null);

  const [selectedDate,     setSelectedDate]     = useState<Date | null>(null);
  const [rangeEnd,         setRangeEnd]         = useState<Date | null>(null);
  const [groupingCustomer, setGroupingCustomer] = useState<PickupDayCustomer | null>(null);
  const [groupingDate,     setGroupingDate]     = useState<Date>(() => georgianToday());
  const [acceptStandalone, setAcceptStandalone] = useState<AdminGroupOrder | null>(null);
  const [acceptTargetId,   setAcceptTargetId]   = useState<string>('');
  const [acceptBusy,       setAcceptBusy]       = useState(false);
  const [whStandalone,     setWhStandalone]     = useState<AdminGroupOrder | null>(null);
  const [whTargetId,       setWhTargetId]       = useState<string>('');
  const [whCourierId,      setWhCourierId]      = useState<string>('');
  const [whBusy,           setWhBusy]           = useState(false);
  const [mergingCustomer,  setMergingCustomer]  = useState<{ name: string; batches: AdminGroupOrder[] } | null>(null);
  const [pickupMode,       setPickupMode]       = useState<'grouped' | 'ungrouped'>('grouped');
  const [customerFilter,   setCustomerFilter]   = useState<string>('');
  const [ungroupedCustomerFilter, setUngroupedCustomerFilter] = useState<string>('');

  // ── Delivery state (mirrors AdminOrdersPage) ────────────────────────────────
  // Selection + bulk assign/price/salary/deliver state lives in usePackageSelection below.
  const [showTracking,  setShowTracking]  = useState(false);
  const [showPrices,    setShowPrices]    = useState(false);
  const [viewingOrder,  setViewingOrder]  = useState<AdminOrderItem | null>(null);
  const [filterCourier, setFilterCourier] = useState<string>('');   // delivery courierId; '' = all
  const [filterUnpriced, setFilterUnpriced] = useState(false);

  const showPricesEff = canManage && showPrices;
  // Revenue column additionally requires canSeeRevenue (hidden from operators).
  const showRevenueEff = showPricesEff && canSeeRevenue;

  // Grouping/summary stay anchored to a single day (the chosen "from" day, else today);
  // the optional range only widens which batches are listed.
  const effectiveDay    = selectedDate ?? georgianToday();
  const effectiveDayKey = toDateKey(effectiveDay);

  const couriersQuery = useQuery({
    queryKey: ['admin', 'couriers'] as const,
    queryFn: () => fetchCouriers(token ?? ''),
    enabled: !!token,
  });
  const couriers = couriersQuery.data ?? [];

  const courierNameById = useMemo(() => {
    const m = new Map<string, string>();
    couriers.forEach(c => m.set(c.courierId, c.fullName));
    return m;
  }, [couriers]);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setActionToast({ msg, type });
    setTimeout(() => setActionToast(null), 4000);
  };

  const openEditOrder = (o: AdminOrder, go: AdminGroupOrder) => {
    setEditing({
      item: toOrderItem(o, go, o.courierId ? (courierNameById.get(o.courierId) ?? null) : null),
      pricing: {
        capital:  go.companyServiceCapitalPrice,
        city:     go.companyServiceCityPrice,
        district: go.companyServiceDistrictPrice,
        specialPrices: go.customerSpecialPrices,
      },
    });
  };

  // ── Data loading ────────────────────────────────────────────────────────────
  // Default view (day navigator untouched) is all active orders — no date bound, scoped
  // to non-terminal statuses via excludeCompleted below (completed orders live on the
  // History page instead). An explicit day/range pick still browses that window.
  const { date: pkgDate, dateTo: pkgDateTo } = dateTouched
    ? resolveDateWindow({ dateTouched, search: debouncedSearch, selectedDate, rangeEnd })
    : {};

  const pkgFilters = {
    search:    debouncedSearch || undefined,
    cities:    filterCities.length > 0 ? filterCities : undefined,
    districts: filterDistricts.length > 0 ? filterDistricts : undefined,
    party:     filterParty,
    status:    filterStatus || undefined,
    courierId: filterCourier || undefined,
    unpriced:  filterUnpriced || undefined,
    excludeCompleted: true,
  };

  // Mirrors the main list's filters/date window, but with a generous pageSize instead of
  // paginating — a batch count within one browsing window is realistically small. Feeds
  // mergeableByCustomer/batchesFor/multiBatchCustomers/ungroupedCustomers, which need every
  // batch for a day (not just whatever fits on the current 30-item page) to detect same-day
  // merge candidates and unattached orders correctly.
  const windowScopedKey = ['admin', 'packages', 'windowScoped', pkgFilters, pkgDate, pkgDateTo] as const;
  const windowScopedQuery = useQuery({
    queryKey: windowScopedKey,
    queryFn: () => fetchGroupOrders(token ?? '', { ...pkgFilters, date: pkgDate, dateTo: pkgDateTo, page: 1, pageSize: 500 }),
    enabled: !!token,
    placeholderData: keepPreviousData,
  });
  const windowScopedOrders = windowScopedQuery.data?.items ?? [];
  const windowScopedTotal  = windowScopedQuery.data?.totalCount ?? 0;

  // The window above already holds every matching row in the near-universal case (its 500-row
  // cap is already assumed "realistically small" per the comment above), so the current page
  // can be sliced from it in memory instead of firing a second, identically-filtered request
  // against the same (expensive, free-text-search-scanning) backend query. mainQuery only needs
  // to hit the network for the rare filter that genuinely returns more than 500 matches.
  const needsServerPage = windowScopedTotal > 500;

  const listQueryKey = ['admin', 'packages', 'list', pkgFilters, pkgDate, pkgDateTo, page] as const;

  const mainQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => fetchGroupOrders(token ?? '', { ...pkgFilters, date: pkgDate, dateTo: pkgDateTo, page, pageSize: PAGE_SIZE }),
    enabled: !!token && needsServerPage,
    placeholderData: keepPreviousData,
  });
  const groupOrders = needsServerPage
    ? (mainQuery.data?.items ?? [])
    : windowScopedOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = needsServerPage
    ? (mainQuery.data?.totalPages ?? 1)
    : Math.max(1, Math.ceil(windowScopedTotal / PAGE_SIZE));
  const loading = needsServerPage ? mainQuery.isPending : windowScopedQuery.isPending;
  const activeListQuery = needsServerPage ? mainQuery : windowScopedQuery;
  const error = activeListQuery.isError
    ? (activeListQuery.error instanceof Error ? activeListQuery.error.message : t.goLoadingOrders)
    : null;

  const summaryQuery = useQuery({
    queryKey: ['admin', 'pickup', 'summary', effectiveDayKey] as const,
    queryFn: () => fetchPickupDay(token ?? '', effectiveDayKey),
    enabled: !!token,
  });
  const daySummary = summaryQuery.data ?? [];

  // Reload with the current filters/page — used by realtime pings and after any mutation that
  // doesn't itself change a filter (assign courier, save price/salary, move/merge/group…).
  // Refetches whichever query is actually backing the visible page right now (see
  // needsServerPage above), since that's what a single-row edit needs refreshed to show up.
  // Returns the refetch promise so callers that need the fresh data before proceeding can await it.
  const reload = useCallback(
    () => (needsServerPage ? mainQuery.refetch() : windowScopedQuery.refetch()),
    [needsServerPage, mainQuery, windowScopedQuery],
  );
  const loadSummary = useCallback(() => summaryQuery.refetch(), [summaryQuery]);
  const loadWindowScoped = useCallback(() => windowScopedQuery.refetch(), [windowScopedQuery]);

  // Patches a single order's courier/status directly into both cached Packages list queries —
  // mirrors AdminOrdersPage's patchOrders so a single-row (re)assign updates the row instantly
  // instead of waiting on reload()'s full (expensive, up-to-500-row) list refetch. reload() still
  // runs afterwards (see PackageRow's onChanged) to reconcile everything else in the background.
  // Deps are stringified so the callback's identity is stable across renders where the filters
  // haven't actually changed, even though listQueryKey/windowScopedKey are new array literals
  // every render — kept out of the dependency array itself so the array only holds identifiers.
  const listQueryKeyStr = JSON.stringify(listQueryKey);
  const windowScopedKeyStr = JSON.stringify(windowScopedKey);
  const patchPackageOrder = useCallback((orderId: string, patch: (o: AdminOrder) => AdminOrder) => {
    const applyTo = (data: PagedResult<AdminGroupOrder> | undefined) => {
      if (!data) return data;
      let changed = false;
      const items = data.items.map(go => {
        const idx = go.orders.findIndex(o => o.id === orderId);
        if (idx === -1) return go;
        changed = true;
        const orders = [...go.orders];
        orders[idx] = patch(orders[idx]);
        return { ...go, orders };
      });
      return changed ? { ...data, items } : data;
    };
    queryClient.setQueryData(listQueryKey, applyTo);
    queryClient.setQueryData(windowScopedKey, applyTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, listQueryKeyStr, windowScopedKeyStr]);

  // Reset to page 1 whenever a filter changes (queryKey reactivity handles the actual refetch).
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterCities, filterDistricts, filterParty, filterStatus, filterCourier, filterUnpriced, dateTouched, pkgDate, pkgDateTo]);

  // Skip a query the SignalR ping wants refetched when it's already fetching or was
  // fetched moments ago — almost always an echo of the reload this same admin's own
  // action just triggered directly (reload()/reloadAfterAction()), not new data from
  // someone else. Halves the grouporders calls fired per action on this (slow) list.
  const SELF_ECHO_MS = 4000;
  const isQueryFresh = (q: { isFetching: boolean; dataUpdatedAt: number }) =>
    q.isFetching || Date.now() - q.dataUpdatedAt < SELF_ECHO_MS;

  useOrdersChangedSignal(token ?? null, 'adminOrdersChanged', () => {
    if (!isQueryFresh(windowScopedQuery)) void loadWindowScoped();
    if (needsServerPage && !isQueryFresh(mainQuery)) void mainQuery.refetch();
    if (!isQueryFresh(summaryQuery)) void loadSummary();
  });

  // Refetch everything a mutation elsewhere in the batch/group-order flow could have changed.
  // loadWindowScoped() alone covers the visible page in the common case (see needsServerPage);
  // mainQuery is only refetched too when it's genuinely the page's data source right now.
  // Shared by every pickup-side action (move/merge/group/accept/warehouse-accept) so they don't
  // each hand-roll the same triplet of refetches.
  const reloadAll = useCallback(() => {
    void loadWindowScoped();
    if (needsServerPage) void mainQuery.refetch();
    void loadSummary();
  }, [loadWindowScoped, needsServerPage, mainQuery, loadSummary]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handlePartyChange  = (party: 'sender' | 'recipient') => { setFilterParty(party); setFilterCities([]); setFilterDistricts([]); };
  const handleCitiesChange = (cities: string[]) => { setFilterCities(cities); setFilterDistricts([]); };

  // ── Derived: cities / districts / geo maps ───────────────────────────────────
  // Sourced from a dedicated locations endpoint (not the loaded `groupOrders` page) so the
  // option list stays complete across the whole matching set instead of whatever happens to
  // be on the currently paginated page. Party-aware: sender = pickup side (GroupOrder /
  // standalone-order-customer), recipient = each order's own recipient (shared with the
  // Delivery page). Scoped to the same resolved date window as the main list.
  const locationsQuery = useQuery({
    queryKey: ['admin', 'packages', 'locations', filterParty, pkgDate, pkgDateTo] as const,
    queryFn: () => filterParty === 'recipient'
      ? fetchOrderLocations(token ?? '', pkgDate, pkgDateTo)
      : fetchGroupOrderLocations(token ?? '', pkgDate, pkgDateTo),
    enabled: !!token,
  });
  const locationOptions = locationsQuery.data ?? [];

  const availableCities = useMemo(() => [...new Set(locationOptions.map(l => l.city))].sort(), [locationOptions]);

  const cityGeoMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    locationOptions.forEach(l => { if (l.cityGeo) map[l.city] = l.cityGeo; });
    return map;
  }, [locationOptions]);

  const districtGeoMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    locationOptions.forEach(l => { if (l.districtGeo) map[l.district] = l.districtGeo; });
    return map;
  }, [locationOptions]);

  const availableDistricts = useMemo(() => {
    if (filterCities.length === 0) return [];
    return [...new Set(locationOptions.filter(l => filterCities.includes(l.city)).map(l => l.district))].sort();
  }, [locationOptions, filterCities]);

  // Unpriced badge — packages (non-terminal) missing a company service price or courier
  // salary (mirrors the server's/Delivery page's "missing financials" definition).
  const unpricedCount = useMemo(() =>
    groupOrders.reduce((sum, go) => sum + go.orders.filter(o =>
      !ACTIVE_ORDER_STATUSES_ONLY.has(o.status)
      && (!o.companyServicePrice || o.courierSalary == null || o.courierSalary === 0)).length, 0),
  [groupOrders]);

  // ── Delivery-side per-package predicate (courier + unpriced filters) ────────
  // The server already scopes which *batches* are returned by these two filters; this
  // still narrows which *packages within an included batch* are shown/expanded — the same
  // role city/district recipient-narrowing plays in visibleOrdersFor below.
  const matchesDeliveryFilters = useCallback((o: AdminOrder) => {
    if (filterCourier && o.courierId !== filterCourier) return false;
    if (filterUnpriced && !(!o.companyServicePrice || o.courierSalary == null || o.courierSalary === 0)) return false;
    return true;
  }, [filterCourier, filterUnpriced]);

  // ── Visible group orders ─────────────────────────────────────────────────────
  // The server already scopes `groupOrders` by date window, city/district, party, status,
  // courier, unpriced, search, and completeness (excludeCompleted) — nothing further to
  // filter here at the batch level.
  const visibleOrders = groupOrders;

  const mergeableByCustomer = useMemo(() => {
    const m = new Map<string, AdminGroupOrder[]>();
    for (const go of windowScopedOrders) {
      if (go.isStandalone || !go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== effectiveDayKey) continue;
      if (!MERGEABLE_STATUSES.has(go.status)) continue;
      const arr = m.get(go.customerId);
      if (arr) arr.push(go); else m.set(go.customerId, [go]);
    }
    for (const arr of m.values())
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return m;
  }, [windowScopedOrders, effectiveDayKey]);

  const batchesFor = useCallback((customerId: string, dKey: string) =>
    windowScopedOrders
      .filter(b => !b.isStandalone && b.customerId === customerId
        && georgianDateKeyOf(b.createdAt) === dKey && MERGEABLE_STATUSES.has(b.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  [windowScopedOrders]);

  const groupedCustomers = useMemo(() => {
    const m = new Map<string, string>();
    for (const go of visibleOrders) if (go.customerId) m.set(go.customerId, go.senderBusinessName);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleOrders]);

  const listOrders = useMemo(
    () => (customerFilter ? visibleOrders.filter(go => go.customerId === customerFilter) : visibleOrders),
    [visibleOrders, customerFilter],
  );

  const multiBatchCustomers = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const go of windowScopedOrders) {
      if (go.isStandalone || !go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== effectiveDayKey) continue;
      const e = counts.get(go.customerId);
      if (e) e.n += 1; else counts.set(go.customerId, { name: go.senderBusinessName, n: 1 });
    }
    return [...counts.entries()].filter(([, v]) => v.n >= 2)
      .map(([id, v]) => ({ id, name: v.name, count: v.n }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [windowScopedOrders, effectiveDayKey]);

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

  const ungroupedListOrders = useMemo(() => {
    const ids = new Set(ungroupedCustomers.map(c => c.id));
    return windowScopedOrders
      .filter(go => !!go.customerId && ids.has(go.customerId)
        && georgianDateKeyOf(go.createdAt) === effectiveDayKey
        && (!ungroupedCustomerFilter || go.customerId === ungroupedCustomerFilter))
      .sort((a, b) => a.customerId !== b.customerId
        ? a.senderBusinessName.localeCompare(b.senderBusinessName)
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [windowScopedOrders, effectiveDayKey, ungroupedCustomers, ungroupedCustomerFilter]);

  const displayList = pickupMode === 'ungrouped' ? ungroupedListOrders : listOrders;

  const hasLocationFilter = filterCities.length > 0 || filterDistricts.length > 0;
  const hasFilters = debouncedSearch || hasLocationFilter || filterStatus || filterCourier || filterUnpriced;
  const clearAll = () => {
    setDebouncedSearch(''); setSearchSeed(''); setSearchResetKey(k => k + 1);
    setFilterCities([]); setFilterDistricts([]); setFilterStatus('');
    setFilterCourier(''); setFilterUnpriced(false);
  };

  // Active packages of a batch matching the recipient location/search AND delivery filters.
  // The backend's `search` param only narrows which batches are returned (a batch matches if
  // ANY of its orders do) — it never trims a matched batch's own order list, so a recipient
  // search still needs this client-side pass to drop that batch's non-matching siblings.
  const visibleOrdersFor = useCallback((go: AdminGroupOrder) => {
    let orders = go.orders.filter(o => !ACTIVE_ORDER_STATUSES_ONLY.has(o.status));
    if (filterCourier || filterUnpriced) orders = orders.filter(matchesDeliveryFilters);
    if (pickupMode === 'ungrouped' || filterParty !== 'recipient') return orders;
    if (filterCities.length > 0 || filterDistricts.length > 0) {
      orders = orders.filter(o => {
        if (filterCities.length > 0 && !filterCities.includes(o.recipientCity)) return false;
        if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
        return true;
      });
    }
    const term = debouncedSearch.trim().toLowerCase();
    if (term) {
      orders = orders.filter(o =>
        o.trackingNumber.toLowerCase().includes(term) ||
        o.recipientName.toLowerCase().includes(term) ||
        o.recipientPhone.includes(term) ||
        o.recipientAddress.toLowerCase().includes(term) ||
        o.recipientCity.toLowerCase().includes(term) ||
        o.recipientDistrict.toLowerCase().includes(term)
      );
    }
    return orders;
  }, [pickupMode, filterParty, filterCities, filterDistricts, filterCourier, filterUnpriced, debouncedSearch, matchesDeliveryFilters]);

  // ── Date-section grouping (copied) ──────────────────────────────────────────
  const groupByDate = (orders: AdminGroupOrder[]) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const sections: { label: string; items: AdminGroupOrder[] }[] = [];
    const buckets: Record<string, AdminGroupOrder[]> = {};
    for (const go of orders) {
      const d = new Date(go.createdAt); d.setHours(0,0,0,0);
      const key = d.getTime() === today.getTime() ? '__today__'
        : d.getTime() === yesterday.getTime() ? '__yesterday__' : go.createdAt.slice(0, 10);
      (buckets[key] ??= []).push(go);
    }
    const orderedKeys = Object.keys(buckets).sort((a, b) => {
      const ta = a === '__today__' ? today.getTime() : a === '__yesterday__' ? yesterday.getTime() : new Date(a).getTime();
      const tb = b === '__today__' ? today.getTime() : b === '__yesterday__' ? yesterday.getTime() : new Date(b).getTime();
      return tb - ta;
    });
    for (const key of orderedKeys) {
      const label = key === '__today__' ? 'Today'
        : key === '__yesterday__' ? 'Yesterday'
        : new Date(key).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      sections.push({ label, items: buckets[key] });
    }
    return sections;
  };

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
      const seen = new Set<string>();
      const rows = flat.map(r => {
        const firstOfBatch = !seen.has(r.go.id);
        seen.add(r.go.id);
        return { ...r, firstOfBatch };
      });
      const earliest = flat.length ? Math.min(...flat.map(r => new Date(r.o.createdAt).getTime())) : new Date(head.createdAt).getTime();
      return { key, head, rows, earliest };
    }).filter(c => c.rows.length > 0).sort((a, b) => a.earliest - b.earliest);
  }, [visibleOrdersFor]);

  const {
    selected, setSelected,
    exporting,
    bulkMode, setBulkMode,
    bulkCourierId, setBulkCourierId, bulkAssigning, bulkDelivering,
    showBulkModal, setShowBulkModal, bulkPrice, setBulkPrice, bulkSalary, setBulkSalary, bulkBusy,
    showSalaryWarning, setShowSalaryWarning, showSalaryModal, setShowSalaryModal,
    salaryDrafts, setSalaryDrafts, salaryChecked, setSalaryChecked, salarySaving,
    showPriceWarning, setShowPriceWarning, showPriceModal, setShowPriceModal,
    priceDrafts, setPriceDrafts, priceChecked, setPriceChecked, priceSaving,
    visibleItems, selectableOrders, allSelected, someSelected, toggleAll, toggleOne,
    rowSelectable, groupSelectableIds, toggleGroupAll, actionPool,
    missingSalaryOrders, missingPriceOrders, missingCourierOrders,
    handleExport, handlePrintLabels, handleBulkApply, cancelBulk,
    handleBulkAssign, handleBulkDeliver, handleSalarySave, handlePriceSave,
  } = usePackageSelection({
    displayList, visibleOrdersFor, courierNameById, couriers, token: token ?? '',
    filterCities, filterDistricts, debouncedSearch, filterCourier, filterUnpriced,
    filterParty, filterStatus, pkgDate, pkgDateTo,
    exportCustomerId: pickupMode === 'ungrouped' ? ungroupedCustomerFilter : customerFilter,
    showToast, reload, reloadAll,
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    // overflow must stay visible (not hidden) or the sticky bulk-action bar below can't
    // stick to the window — an overflow:hidden ancestor traps position:sticky. The inner
    // tables keep their own overflow-x wrappers, so nothing spills horizontally.
    <div className="content-card pkg-page" style={{ overflow: 'visible' }}>
      {/* Packages-page-only tint: give the collapsed group-order rows an explicit grey
          and keep the expanded single orders crisp white, so the two levels of the
          accordion read as clearly distinct. Scoped to .pkg-page so the Pick-Up page
          (which shares these global go-* classes) is untouched. */}
      <style>{`
        .pkg-page .go-row-header { background: #e6e0d7; }
        .pkg-page .go-orders { background: var(--color-bg-2); }
      `}</style>
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
            <button className={`pickup-mode ${pickupMode === 'grouped' ? 'pickup-mode--active' : ''}`} onClick={() => setPickupMode('grouped')}>{t.pickupTabGrouped}</button>
            <button className={`pickup-mode ${pickupMode === 'ungrouped' ? 'pickup-mode--active' : ''}`} onClick={() => setPickupMode('ungrouped')}>{t.pickupTabUngrouped}</button>
          </div>
        )}
      </div>

      {/* Non-grouped controls */}
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
          {ungroupedCustomerFilter && (() => {
            const mergeable = mergeableByCustomer.get(ungroupedCustomerFilter) ?? [];
            const summary = daySummary.find(c => c.customerId === ungroupedCustomerFilter);
            const name = ungroupedCustomers.find(c => c.id === ungroupedCustomerFilter)?.name ?? summary?.businessName ?? '';
            return (
              <>
                {canGroup && mergeable.length >= 2 && <button className="pickup-cust__merge" onClick={() => setMergingCustomer({ name, batches: mergeable })}>{t.pickupMergeBtn}</button>}
                {canGroup && summary && summary.unattachedOrders > 0 && <button className="pickup-cust__group" onClick={() => { setGroupingDate(effectiveDay); setGroupingCustomer(summary ?? null); }}>{t.pickupGroupOrdersBtn}</button>}
              </>
            );
          })()}
          {ungroupedCustomers.length === 0 && <span className="go-count">{t.pickupNoUngrouped}</span>}
        </div>
      )}

      {/* Grouped customer filter */}
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
        {/* Search + location filter */}
        <div className="go-toolbar go-toolbar--search" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <DebouncedSearchBox
            key={searchResetKey}
            initialValue={searchSeed}
            onChange={setDebouncedSearch}
            placeholder={t.goSearchPh}
            debounceMs={350}
            minChars={MIN_SEARCH_CHARS}
            minCharsHint={t.goSearchMinChars}
          />
          <div style={{ width: 1, height: 28, background: 'var(--color-border)', flexShrink: 0, alignSelf: 'center' }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <div className="go-filter-step">
              <span className="go-step-label">{t.goParty}</span>
              <div className="go-seg">
                <button className={`go-seg__btn ${filterParty === 'sender' ? 'go-seg__btn--active' : ''}`} onClick={() => handlePartyChange('sender')}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3 2.686-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  {t.goSender}
                </button>
                <button className={`go-seg__btn ${filterParty === 'recipient' ? 'go-seg__btn--active' : ''}`} onClick={() => handlePartyChange('recipient')}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  {t.goRecipient}
                </button>
              </div>
            </div>
            <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginBottom: 6 }}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div className="go-filter-step">
              <span className="go-step-label">{t.goCity}</span>
              <LocationMultiPicker available={availableCities} selected={filterCities} onChange={handleCitiesChange}
                geoMap={cityGeoMap} locLabel={locCity} allLabel={t.goAllCities} disabled={loading || availableCities.length === 0} />
            </div>
            {filterCities.length > 0 && (
              <>
                <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginBottom: 6 }}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div className="go-filter-step">
                  <span className="go-step-label">{t.goDistrict}</span>
                  <LocationMultiPicker available={availableDistricts} selected={filterDistricts} onChange={setFilterDistricts}
                    geoMap={districtGeoMap} locLabel={locDistrict} allLabel={t.goAllDistricts} disabled={availableDistricts.length === 0} />
                </div>
              </>
            )}
            {(hasLocationFilter || filterCourier || filterUnpriced) && (
              <button className="go-clear-btn" onClick={clearAll} style={{ alignSelf: 'flex-end' }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                {t.goClear}
              </button>
            )}
          </div>
          {!loading && !error && (
            <span className="go-count" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
              {t.goPkgs(visibleItems.length)}
            </span>
          )}
        </div>

        {/* Delivery controls row */}
        {canManage && (
          <div className="go-toolbar pkg-delivery-toolbar">
            <label className="aop-col-toggle"><input type="checkbox" checked={showTracking} onChange={e => setShowTracking(e.target.checked)} />{t.aopShowTracking}</label>
            <label className="aop-col-toggle"><input type="checkbox" checked={showPrices} onChange={e => setShowPrices(e.target.checked)} />{t.aopShowPrices}</label>

            {/* Selects/deselects every package currently matching the filters above (all
                customer batches, not just the one you happen to have expanded) — this is
                the only always-visible select-all; the bulk bar's own checkbox stays hidden
                until at least one row is picked. */}
            <label className="aop-col-toggle" style={{ opacity: selectableOrders.length === 0 ? 0.5 : 1 }}>
              <input type="checkbox" className="aop-checkbox" checked={allSelected} disabled={selectableOrders.length === 0}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleAll} />
              {allSelected ? t.aopDeselectAll : t.aopSelectAllN(selectableOrders.length)}
            </label>

            <div className="go-select-wrap">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              <select className="go-select" value={filterCourier} onChange={e => setFilterCourier(e.target.value)}>
                <option value="">{t.aopAllCouriers}</option>
                {couriers.map(c => <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}</option>)}
              </select>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>

            <button className={`aop-unpriced-btn${filterUnpriced ? ' aop-unpriced-btn--active' : ''}`} onClick={() => setFilterUnpriced(v => !v)} title={t.aopUnpricedTitle}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {t.aopUnpriced}
              {unpricedCount > 0 && <span className={`aop-unpriced-badge${filterUnpriced ? ' aop-unpriced-badge--active' : ''}`}>{unpricedCount}</span>}
            </button>

            <button className={`aop-unpriced-btn${bulkMode === 'deliver' ? ' aop-unpriced-btn--active' : ''}`}
              onClick={() => { if (bulkMode === 'deliver') { setBulkMode('assign'); setSelected(new Set()); setBulkCourierId(''); } else setBulkMode('deliver'); }}
              style={{ marginLeft: 'auto' }} title={t.aopModeDeliver}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8.5l3.5 3.5L14 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {t.aopModeDeliver}
            </button>

            <button className="aop-export-btn" onClick={handleExport} disabled={exporting || loading} title={t.aopExportTitle}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {exporting ? t.aopExporting : (selected.size > 0 ? t.aopExportSelected(selected.size) : t.aopExportExcel)}
            </button>
          </div>
        )}

        {/* Status pills */}
        <div className="go-toolbar go-status-bar">
          <span className="go-filter-label">{t.goStatus}</span>
          {STATUS_PILLS.map(({ value, label }) => (
            <button key={value || 'all'} className={`go-status-pill ${filterStatus === value ? 'go-status-pill--active' : ''}`} onClick={() => setFilterStatus(value)}>
              {t[label]}
            </button>
          ))}
        </div>

        {/* Bulk action bar (Delivery) */}
        {canManage && (someSelected || bulkMode === 'deliver') && (
          <div className="aop-bulk-bar">
            <div className="go-seg" style={{ flexShrink: 0 }}>
              <button className={`go-seg__btn${bulkMode === 'assign' ? ' go-seg__btn--active' : ''}`} onClick={() => setBulkMode('assign')}>{t.aopModeAssign}</button>
              <button className={`go-seg__btn${bulkMode === 'prices' ? ' go-seg__btn--active' : ''}`} onClick={() => setBulkMode('prices')}>{t.aopModePrices}</button>
              <button className={`go-seg__btn${bulkMode === 'deliver' ? ' go-seg__btn--active' : ''}`} onClick={() => setBulkMode('deliver')}>{t.aopModeDeliver}</button>
            </div>
            <button type="button" className="aop-bulk-btn aop-bulk-btn--ghost" onClick={handlePrintLabels} title={t.aopPrintLabelsTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4.5 6V2.5h7V6M4.5 11.5h-1A1.5 1.5 0 0 1 2 10V8a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 8v2a1.5 1.5 0 0 1-1.5 1.5h-1M4.5 9.5h7v4h-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {t.aopPrintLabels}
            </button>
            <label className="aop-bulk-count" style={{ cursor: 'pointer' }}>
              <input type="checkbox" className="aop-checkbox" checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={toggleAll} />
              {t.aopNSelected(selected.size)}
            </label>

            {bulkMode === 'assign' && (
              <>
                <div className="go-select-wrap">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  <select className="go-select" value={bulkCourierId} onChange={e => setBulkCourierId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">{t.aopChooseCourierOpt}</option>
                    {couriers.filter(c => !c.isDeleted).map(c => <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}, {c.assignedDistrict}</option>)}
                  </select>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <button className="aop-bulk-btn aop-bulk-btn--salary" disabled={!bulkCourierId || bulkAssigning} onClick={handleBulkAssign}>
                  {bulkAssigning ? t.aopAssigning : t.aopAssignToN(selected.size)}
                </button>
              </>
            )}

            {bulkMode === 'prices' && (
              <>
                {!showBulkModal ? (
                  <button className="aop-bulk-btn aop-bulk-btn--price" onClick={() => setShowBulkModal(true)}>{t.aopSetPrices}</button>
                ) : (
                  <div className="aop-bulk-input-row">
                    <span className="aop-bulk-label">{t.aopBulkSvcLabel}</span>
                    <div className="aop-bulk-input-wrap">
                      <span className="aop-bulk-currency">₾</span>
                      <input className="aop-bulk-input" type="number" min="0" step="0.01" placeholder={t.aopUnchangedPh} value={bulkPrice} autoFocus
                        onChange={e => setBulkPrice(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') cancelBulk(); }} />
                    </div>
                    <span className="aop-bulk-label" style={{ marginLeft: 8 }}>{t.aopBulkSalLabel}</span>
                    <div className="aop-bulk-input-wrap">
                      <span className="aop-bulk-currency">₾</span>
                      <input className="aop-bulk-input" type="number" min="0" step="0.01" placeholder={t.aopUnchangedPh} value={bulkSalary}
                        onChange={e => setBulkSalary(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleBulkApply(); if (e.key === 'Escape') cancelBulk(); }} />
                    </div>
                    <button className="aop-bulk-btn aop-bulk-btn--apply" disabled={bulkBusy || (!bulkPrice && !bulkSalary)} onClick={handleBulkApply}>{bulkBusy ? t.aopSaving : t.aopApply}</button>
                    <button className="aop-bulk-btn aop-bulk-btn--ghost" disabled={bulkBusy} onClick={cancelBulk}>{t.cancel}</button>
                  </div>
                )}
              </>
            )}

            {bulkMode === 'deliver' && (
              <>
                {missingCourierOrders.length > 0 && (
                  <div className="go-select-wrap">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="go-select-icon"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    <select className="go-select" value={bulkCourierId} onChange={e => setBulkCourierId(e.target.value)} style={{ minWidth: 220 }}>
                      <option value="">{t.aopCourierForUnassigned}</option>
                      {couriers.filter(c => !c.isDeleted).map(c => <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}, {c.assignedDistrict}</option>)}
                    </select>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="go-select-chevron"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
                <button className="aop-bulk-btn aop-bulk-btn--deliver" disabled={bulkDelivering || actionPool.length === 0} onClick={handleBulkDeliver}>
                  {bulkDelivering ? t.aopMarking : t.aopMarkNDelivered(actionPool.length)}
                </button>
              </>
            )}

            <button className="aop-bulk-btn aop-bulk-btn--ghost" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>{t.aopDeselectAll}</button>
          </div>
        )}
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

      {/* List */}
      {!loading && !error && displayList.length > 0 && (() => {
        // Recipient party always shows single orders directly — no batch/group wrapper —
        // matching Sender party's expandable-batch view. A batch matching the backend's
        // search/filters can still have some non-matching sibling orders, so this can be
        // empty even though displayList (batches) is not; handled below.
        const showFlat = pickupMode === 'grouped' && filterParty === 'recipient';

        if (showFlat) {
          const flatRows = listOrders.flatMap(go => visibleOrdersFor(go).map(o => ({ o, go })));
          if (flatRows.length === 0) {
            return (
              <div className="empty-state" style={{ padding: '48px 20px' }}>
                <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
                  <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="empty-state__text">{hasFilters ? t.goNoOrdersFilters : t.goNoOrders}</span>
              </div>
            );
          }
          return (
            <div style={{ overflowX: 'auto' }}>
              <table className="go-orders-table">
                <PackageTableHead showStore selectAllGo="global" canManage={canManage} allSelected={allSelected}
                  someSelected={someSelected} hasSelectableOrders={selectableOrders.length > 0} toggleAll={toggleAll}
                  groupSelectableIds={groupSelectableIds} selected={selected} toggleGroupAll={toggleGroupAll}
                  showTracking={showTracking} showPricesEff={showPricesEff} showRevenueEff={showRevenueEff} />
                <tbody>{flatRows.map(({ o, go }) => (
                  <PackageRow key={o.id} o={o} go={go} moveDestinations={[]} showStore
                    canManage={canManage} canGroup={canGroup} selected={selected} toggleOne={toggleOne} rowSelectable={rowSelectable}
                    courierNameById={courierNameById} showTracking={showTracking} absentPkgs={absentPkgs} togglePkgPresent={togglePkgPresent}
                    showPricesEff={showPricesEff} showRevenueEff={showRevenueEff} couriers={couriers} token={token ?? ''}
                    setViewingOrder={setViewingOrder} openEditOrder={openEditOrder} reload={reload} reloadAll={reloadAll} showToast={showToast}
                    patchOrder={patchPackageOrder} />
                ))}</tbody>
              </table>
            </div>
          );
        }

        const sections = groupByDate(displayList);
        return (
          <div className="go-list">
            {sections.map(({ label, items }) => {
              const customers = buildCustomerGroups(items);
              return (
                <div key={label}>
                  <div style={{ padding: '7px 20px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    {label}
                    <span style={{ marginLeft: 4, fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>— {customers.length} customer{customers.length !== 1 ? 's' : ''}</span>
                  </div>
                  {items.map(go => {
                    const expanded = expandedIds.has(go.id);
                    const filteredOrders = visibleOrdersFor(go);
                    const custBatches = go.customerId ? (mergeableByCustomer.get(go.customerId) ?? []) : [];
                    const moveDestinations = custBatches.some(b => b.id === go.id) ? custBatches.filter(b => b.id !== go.id) : [];
                    return (
                      <div className="go-row" key={go.id}>
                        <div className="go-row-header" onClick={() => toggleExpand(go.id)}>
                          <svg className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
                                {go.alternativeSenderPhone && <PhoneActions phone={go.alternativeSenderPhone} />}
                              </div>
                              <div className="go-cell">
                                <span className="go-cell__label">{t.cgoPickupLocation}</span>
                                <span className="go-cell__value">{locCity(go.pickUpCity, go.pickUpCityGeo)}, {locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}</span>
                                {go.pickUpAddress && <span className="go-cell__sub">{go.pickUpAddress}</span>}
                                <span style={{ marginTop: 4 }} onClick={e => e.stopPropagation()}>
                                  <ViewOnMapButton city={go.pickUpCity} district={go.pickUpDistrict} address={go.pickUpAddress}
                                    lat={go.pickUpLatitude} lon={go.pickUpLongitude} />
                                </span>
                              </div>
                              <div className="go-cell go-cell--center">
                                <span className="go-cell__label">{t.goColStatus}</span>
                                <StatusBadge status={go.status} />
                                {go.isStandalone && <span style={{ marginTop: 3, fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-accent)', background: 'var(--color-accent-dim)', borderRadius: 100, padding: '1px 7px', whiteSpace: 'nowrap' }}>{t.pickupStandaloneBadge}</span>}
                                {/* Courier name folds into this cell (mirrors the Pick-Up page's
                                    version of this same row) rather than getting its own — the
                                    shared .go-details grid only has 6 tracks, and adding a 7th
                                    conditional cell here wraps the row onto a second grid line,
                                    dropping the Date cell underneath Sender. */}
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
                            // Returns stay standalone for life — batching one drops it off the
                            // assigned courier's pickup list (same guard as AdminDashboard, and
                            // enforced server-side). They are driven from Return & Exchange.
                            go.orders[0]?.orderType === 'Return' ? (
                              <div style={{ paddingRight: 12, flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                                {t.pickupReturnManagedElsewhere}
                              </div>
                            ) : (canGroup || canManage) && go.customerId && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {canGroup && <button className="go-action-btn go-action-btn--ghost" onClick={e => { e.stopPropagation(); setGroupingDate(new Date(georgianDateKeyOf(go.createdAt) + 'T00:00:00')); setGroupingCustomer({ customerId: go.customerId!, businessName: go.senderBusinessName, ordersPlaced: 1, unattachedOrders: 1 }); }}>{t.pickupGroupOrdersBtn}</button>}
                                {canManage && <button className="go-action-btn go-action-btn--accept" onClick={e => { e.stopPropagation(); const bs = batchesFor(go.customerId!, georgianDateKeyOf(go.createdAt)); setAcceptTargetId(bs[0]?.id ?? ''); setAcceptStandalone(go); }}>{t.goAccept}</button>}
                                {canManage && <button className="go-action-btn go-action-btn--warehouse" onClick={e => { e.stopPropagation(); setWhTargetId(''); setWhCourierId(''); setWhStandalone(go); }}>{t.goForceWarehouse}</button>}
                              </div>
                            )
                          ) : (
                            <AdminGroupOrderActions groupOrder={go} couriers={couriers} token={token ?? ''}
                              onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
                              onRefresh={() => reload()} canManage={canManage} canAssignCourier={canAssignCourier}
                              showDownload={canManage}
                              warehousePresentIds={go.status === 'DeliveredToWarehouse'
                                ? go.orders.filter(o => o.status === 'DeliveredToWarehouse' && !absentPkgs.has(o.id)).map(o => o.id)
                                : undefined}
                              warehouseAbsentCount={go.status === 'DeliveredToWarehouse'
                                ? go.orders.filter(o => o.status === 'DeliveredToWarehouse' && absentPkgs.has(o.id)).length
                                : undefined} />
                          )}
                        </div>
                        {expanded && (
                          <div className="go-orders">
                            {filteredOrders.length === 0 ? (
                              <div style={{ padding: '16px 20px', fontSize: '0.825rem', color: 'var(--color-text-subtle)' }}>{t.goNoLocationMatch}</div>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table className="go-orders-table">
                                  <PackageTableHead selectAllGo={go} canManage={canManage} allSelected={allSelected}
                                    someSelected={someSelected} hasSelectableOrders={selectableOrders.length > 0} toggleAll={toggleAll}
                                    groupSelectableIds={groupSelectableIds} selected={selected} toggleGroupAll={toggleGroupAll}
                                    showTracking={showTracking} showPricesEff={showPricesEff} showRevenueEff={showRevenueEff} />
                                  <tbody>{filteredOrders.map(o => (
                                    <PackageRow key={o.id} o={o} go={go} moveDestinations={moveDestinations} warehouseSelectable
                                      canManage={canManage} canGroup={canGroup} selected={selected} toggleOne={toggleOne} rowSelectable={rowSelectable}
                                      courierNameById={courierNameById} showTracking={showTracking} absentPkgs={absentPkgs} togglePkgPresent={togglePkgPresent}
                                      showPricesEff={showPricesEff} showRevenueEff={showRevenueEff} couriers={couriers} token={token ?? ''}
                                      setViewingOrder={setViewingOrder} openEditOrder={openEditOrder} reload={reload} reloadAll={reloadAll} showToast={showToast}
                                      patchOrder={patchPackageOrder} />
                                  ))}</tbody>
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

      {/* Pager — the server-paginated grouped list; ungrouped mode is a same-day cross-check
          view over the same fetched page, so it doesn't get its own pager. */}
      {pickupMode === 'grouped' && !loading && !error && totalPages > 1 && (
        <div className="aop-pagination">
          <button className="aop-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t.aopPrevPage}
          </button>
          <span className="aop-page-info">{t.aopPageInfo(page, totalPages)}</span>
          <button className="aop-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            {t.aopNextPage}
          </button>
        </div>
      )}

      {/* Action toast */}
      {actionToast && <div className={`action-toast ${actionToast.type === 'err' ? 'action-toast--err' : ''}`} role="status">{actionToast.msg}</div>}

      {/* Salary / price warnings */}
      {showSalaryWarning && <SalaryWarningModal orderCount={missingSalaryOrders.length} onCancel={() => setShowSalaryWarning(false)} onFillSalaries={() => { setShowSalaryWarning(false); setShowSalaryModal(true); }} />}
      {showPriceWarning && <PriceWarningModal orderCount={missingPriceOrders.length} onCancel={() => setShowPriceWarning(false)} onFillPrices={() => { setShowPriceWarning(false); setShowPriceModal(true); }} />}

      {/* Salary modal */}
      {showSalaryModal && (
        <BulkFieldModal field="salary" orders={missingSalaryOrders} drafts={salaryDrafts} setDrafts={setSalaryDrafts}
          checked={salaryChecked} setChecked={setSalaryChecked} saving={salarySaving} canSeeRevenue={canSeeRevenue}
          onSave={handleSalarySave} onClose={() => setShowSalaryModal(false)} />
      )}

      {/* Price modal */}
      {showPriceModal && (
        <BulkFieldModal field="price" orders={missingPriceOrders} drafts={priceDrafts} setDrafts={setPriceDrafts}
          checked={priceChecked} setChecked={setPriceChecked} saving={priceSaving} canSeeRevenue={canSeeRevenue}
          onSave={handlePriceSave} onClose={() => setShowPriceModal(false)} />
      )}

      {/* Edit modal (package edit) */}
      <EditOrderModal order={editing?.item ?? null} open={!!editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void reload(); }} token={token ?? ''} couriers={couriers}
        customerPricing={editing?.pricing ?? null} canSeeRevenue={canSeeRevenue} />

      {/* View modal */}
      <ViewOrderModal order={viewingOrder} open={viewingOrder !== null} onClose={() => setViewingOrder(null)} showFinancials={canManage} showRevenue={canSeeRevenue} />

      {/* Grouping modal */}
      {groupingCustomer && (
        <GroupingModal customer={groupingCustomer} date={groupingDate} batches={batchesFor(groupingCustomer.customerId, toDateKey(groupingDate))} token={token ?? ''}
          onClose={() => setGroupingCustomer(null)}
          onGrouped={n => { setGroupingCustomer(null); showToast(t.pickupGroupedToast(n)); reloadAll(); }} />
      )}

      {/* Merge modal */}
      {mergingCustomer && (
        <MergeModal customerName={mergingCustomer.name} batches={mergingCustomer.batches} token={token ?? ''}
          onClose={() => setMergingCustomer(null)}
          onMerged={() => { setMergingCustomer(null); showToast(t.pickupMergedToast); reloadAll(); }} />
      )}

      {/* Accept standalone */}
      {acceptStandalone && (() => {
        const batches = acceptStandalone.customerId ? batchesFor(acceptStandalone.customerId, georgianDateKeyOf(acceptStandalone.createdAt)) : [];
        return createPortal(
          <div className="pickup-modal__overlay" onClick={() => { if (!acceptBusy) setAcceptStandalone(null); }}>
            <div className="pickup-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="pickup-modal__header">
                <div>
                  <h3 className="pickup-modal__title">{t.pickupStandaloneAcceptTitle}</h3>
                  <p className="pickup-modal__subtitle">{batches.length > 0 ? t.pickupStandaloneAcceptChoose : t.pickupStandaloneAcceptNewOnly(acceptStandalone.senderBusinessName)}</p>
                </div>
                <button className="pickup-modal__close" onClick={() => setAcceptStandalone(null)} disabled={acceptBusy} aria-label={t.close}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
              </div>
              {batches.length > 0 && (
                <div className="pickup-modal__body">
                  <label className="pickup-modal__target">
                    <span>{t.pickupGroupTarget}</span>
                    <select className="go-select" value={acceptTargetId} onChange={e => setAcceptTargetId(e.target.value)} disabled={acceptBusy}>
                      {batches.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}</option>)}
                      <option value="">{t.pickupGroupNewBatch}</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="pickup-modal__footer" style={{ paddingTop: 16 }}>
                <button className="go-action-btn go-action-btn--ghost" onClick={() => setAcceptStandalone(null)} disabled={acceptBusy}>{t.cancel}</button>
                <button className="go-action-btn go-action-btn--accept" disabled={acceptBusy}
                  onClick={async () => {
                    setAcceptBusy(true);
                    try {
                      await groupAndAcceptStandalone(token ?? '', acceptStandalone.id, acceptTargetId || undefined);
                      setAcceptStandalone(null); showToast(t.pickupStandaloneAcceptedToast); reloadAll();
                    } catch (e) { showToast(e instanceof Error ? e.message : t.goActionFailed, 'err'); }
                    finally { setAcceptBusy(false); }
                  }}>{acceptBusy ? t.pickupStandaloneAccepting : t.pickupStandaloneAcceptConfirm}</button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Warehouse standalone */}
      {whStandalone && (() => {
        const batches = whStandalone.customerId ? batchesFor(whStandalone.customerId, georgianDateKeyOf(whStandalone.createdAt)) : [];
        const targetBatch = batches.find(b => b.id === whTargetId);
        const courierRequired = !targetBatch?.courierId;
        const activeCouriers = couriers.filter(c => !c.isDeleted);
        return createPortal(
          <div className="pickup-modal__overlay" onClick={() => { if (!whBusy) setWhStandalone(null); }}>
            <div className="pickup-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="pickup-modal__header">
                <div>
                  <h3 className="pickup-modal__title">{t.pickupStandaloneWhTitle}</h3>
                  <p className="pickup-modal__subtitle">{batches.length > 0 ? t.pickupStandaloneWhChoose : t.pickupStandaloneWhNewOnly(whStandalone.senderBusinessName)}</p>
                </div>
                <button className="pickup-modal__close" onClick={() => setWhStandalone(null)} disabled={whBusy} aria-label={t.close}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
              </div>
              <div className="pickup-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {batches.length > 0 && (
                  <label className="pickup-modal__target">
                    <span>{t.pickupGroupTarget}</span>
                    <select className="go-select" value={whTargetId} onChange={e => setWhTargetId(e.target.value)} disabled={whBusy}>
                      {batches.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}</option>)}
                      <option value="">{t.pickupGroupNewBatch}</option>
                    </select>
                  </label>
                )}
                {courierRequired && (
                  <label className="pickup-modal__target">
                    <span>{t.pickupStandaloneWhCourier}</span>
                    <select className="go-select" value={whCourierId} onChange={e => setWhCourierId(e.target.value)} disabled={whBusy}>
                      <option value="">{t.goChooseCourierOption}</option>
                      {activeCouriers.map(c => <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}, {c.assignedDistrict}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="pickup-modal__footer" style={{ paddingTop: 16 }}>
                <button className="go-action-btn go-action-btn--ghost" onClick={() => setWhStandalone(null)} disabled={whBusy}>{t.cancel}</button>
                <button className="go-action-btn go-action-btn--warehouse" disabled={whBusy || (courierRequired && !whCourierId)}
                  onClick={async () => {
                    setWhBusy(true);
                    try {
                      await groupAndWarehouseStandalone(token ?? '', whStandalone.id, { targetGroupOrderId: whTargetId || undefined, courierId: whCourierId || undefined });
                      setWhStandalone(null); showToast(t.pickupStandaloneWhToast); reloadAll();
                    } catch (e) { showToast(e instanceof Error ? e.message : t.goActionFailed, 'err'); }
                    finally { setWhBusy(false); }
                  }}>{whBusy ? t.pickupStandaloneAccepting : t.goForceWarehouse}</button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Page-local styles for the fused delivery controls (pickup styles come from the
          dashboard global stylesheet). */}
      <style>{`
        .pkg-delivery-toolbar { background: var(--color-bg-3); border-bottom: 1px solid var(--color-border); gap: 10px; flex-wrap: wrap; }
        .pkg-row--selected { background: rgba(196,127,23,0.07); }
        .aop-col-toggle { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; color: var(--color-text-subtle); cursor: pointer; user-select: none; white-space: nowrap; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg); transition: all var(--transition); }
        .aop-col-toggle:hover { color: var(--color-text); border-color: var(--color-text-subtle); }
        .aop-col-toggle input[type="checkbox"] { width: 13px; height: 13px; cursor: pointer; accent-color: var(--color-accent); margin: 0; }
        .aop-checkbox { width: 15px; height: 15px; cursor: pointer; accent-color: var(--color-accent); }
        .aop-courier-name { margin-top: 3px; font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); display: flex; align-items: center; gap: 3px; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .aop-price { font-weight: 600; font-variant-numeric: tabular-nums; }
        .aop-missing { font-size: 0.73rem; font-weight: 600; color: #ef4444; background: rgba(239,68,68,0.1); border-radius: 4px; padding: 2px 7px; }
        .aop-unpriced-btn { display: flex; align-items: center; gap: 7px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 600; padding: 7px 13px; cursor: pointer; transition: all var(--transition); white-space: nowrap; }
        .aop-unpriced-btn:hover:not(.aop-unpriced-btn--active) { color: var(--color-text); border-color: var(--color-text-subtle); }
        .aop-unpriced-btn--active { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444; }
        .aop-unpriced-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px; padding: 0 5px; background: #ef4444; color: #fff; border-radius: 100px; font-size: 0.68rem; font-weight: 700; line-height: 1; }
        .aop-unpriced-badge--active { background: #fff; color: #ef4444; }
        .aop-export-btn { display: inline-flex; align-items: center; gap: 7px; background: #16a34a; border: 1px solid #16a34a; color: #fff; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600; padding: 7px 13px; cursor: pointer; transition: opacity var(--transition); white-space: nowrap; }
        .aop-export-btn:hover:not(:disabled) { opacity: 0.9; }
        .aop-export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .aop-bulk-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 20px; background: linear-gradient(var(--color-accent-dim), var(--color-accent-dim)), var(--color-bg); border-bottom: 1px solid rgba(196,127,23,0.25); animation: expand-in 0.15s ease both; position: sticky; top: var(--staff-nav-h, 64px); z-index: 20; }
        .aop-bulk-count { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: var(--color-accent); }
        .aop-bulk-btn { border: none; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600; padding: 7px 14px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
        .aop-bulk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .aop-bulk-btn--price { background: #8b5cf6; color: #fff; }
        .aop-bulk-btn--salary { background: #10b981; color: #fff; }
        .aop-bulk-btn--deliver { background: #16a34a; color: #fff; }
        .aop-bulk-btn--apply { background: var(--color-accent); color: #fff; }
        .aop-bulk-btn--ghost { background: var(--color-bg-3); border: 1px solid var(--color-border); color: var(--color-text); }
        .aop-bulk-input-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .aop-bulk-label { font-size: 0.82rem; font-weight: 600; color: var(--color-text); white-space: nowrap; }
        .aop-bulk-input-wrap { position: relative; display: flex; align-items: center; }
        .aop-bulk-currency { position: absolute; left: 10px; font-size: 0.85rem; color: var(--color-text-subtle); pointer-events: none; }
        .aop-bulk-input { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.875rem; padding: 7px 10px 7px 26px; width: 130px; outline: none; transition: border-color var(--transition); }
        .aop-bulk-input:focus { border-color: var(--color-accent); }

        /* ── Pagination ── */
        .aop-pagination { display: flex; align-items: center; gap: 14px; justify-content: center; padding: 16px 20px; border-top: 1px solid var(--color-border); }
        .aop-page-btn { background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.82rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: background var(--transition); }
        .aop-page-btn:hover:not(:disabled) { background: var(--color-bg-2); }
        .aop-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .aop-page-info { font-size: 0.82rem; color: var(--color-text-subtle); }

        /* ── Mobile (≤768px) ── */
        @media (max-width: 768px) {
          /* Tighter side padding; toolbars/bulk bar already wrap. */
          .pkg-delivery-toolbar, .aop-bulk-bar { padding-left: 14px; padding-right: 14px; }
          .aop-pagination { padding: 14px; }
        }
      `}</style>
    </div>
  );
}
