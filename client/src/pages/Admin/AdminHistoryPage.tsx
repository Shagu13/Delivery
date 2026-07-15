import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { Highlight } from '../../components/ui/Highlight';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder, AdminOrder, OrderStatus } from '../../api/adminGroupOrders';
import { fetchReturnExchangeOrders } from '../../api/returnExchange';
import type { ReturnExchangeOrder } from '../../api/returnExchange';
import { correctOrderStatus, markCancelledReturnedToSender } from '../../api/orders';
import { fetchCouriers } from '../../api/couriers';
import { getCustomers } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import { getStatusMeta } from '../../utils/statusMeta';
import { georgianToday, toDateKey, georgianDateKeyOf } from '../../utils/georgianTime';
import { DateRangeNav } from '../../components/ui/DateRangeNav';
import { ViewOrderModal } from './ViewOrderModal';
import type { AdminOrderItem } from './AdminOrdersPage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(v: number | null | undefined) {
  if (v == null) return <span style={{ opacity: 0.35 }}>—</span>;
  return <span>₾{v.toFixed(2)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const meta = getStatusMeta(status, lang);
  const cls =
    status === 'DeliveredToRecipient' || status === 'AllDelivered' || status === 'ExchangeCompleted' || status === 'ReturnedToSender'
      ? 'status-badge status-badge--delivered'
      : status.startsWith('Cancelled') || status === 'OrderNotAccepted'
        ? 'status-badge status-badge--cancelled'
        : 'status-badge status-badge--neutral';
  return <span className={cls} title={meta.description}>{meta.short}</span>;
}

// ── History categories ──────────────────────────────────────────────────────

type HistoryFilter = 'delivered' | 'cancelled' | 'cancelledReturned' | 'returned' | 'exchanged' | 'pickedup';

// Client-side pagination: render at most this many rows at once. With "All" days selected
// a category can hold thousands of rows; rendering them all is what makes the page janky.
const PAGE_SIZE = 100;

const HISTORY_PILLS: { value: HistoryFilter; labelKey: string }[] = [
  { value: 'delivered', labelKey: 'histPillDelivered' },
  { value: 'cancelled', labelKey: 'histPillCancelled' },
  { value: 'cancelledReturned', labelKey: 'histPillCancelledReturned' },
  { value: 'returned',  labelKey: 'histPillReturned' },
  { value: 'exchanged', labelKey: 'histPillExchanged' },
  { value: 'pickedup',  labelKey: 'histPillPickedUp' },
];

// Group-order statuses meaning "the batch has reached the warehouse".
const WAREHOUSE_STATUSES = new Set<string>(['DeliveredToWarehouse', 'AdminAcceptedOrderInWareHouse']);

// The day a batch was brought to the warehouse: its pickup timestamp, else the
// warehouse-drop timestamp, else (admin force-to-warehouse with no timestamps) its created day.
function pickedUpDateOf(go: AdminGroupOrder): string {
  return go.pickedUpAt ?? go.deliveredToWarehouseAt ?? go.createdAt;
}

const CANCELLED_STATUSES = new Set<string>(['CancelledBySender', 'CancelledByAdmin', 'OrderNotAccepted']);

// Which history category a single order belongs to — or null when it is not yet
// terminal (still in progress, so it has no place in History). Mirrors the prior
// group-level logic but applied per order so the list is flat single orders.
function orderCategory(o: AdminOrder): HistoryFilter | null {
  if (o.status === 'DeliveredToRecipient' && o.orderType !== 'Exchange') return 'delivered';
  if (o.status === 'ExchangeCompleted') return 'exchanged';
  // Any order physically returned to the sender/store (marker set) belongs in "Cancelled &
  // Returned" — this includes Return/Exchange orders marked returned-to-sender (whose Status
  // is ReturnedToSender) and cancelled Send/Exchange orders that were handed back. Checked
  // before the ReturnedToSender status so the marker wins.
  if (o.cancelledReturnedToSenderAt) return 'cancelledReturned';
  if (o.status === 'ReturnedToSender') return 'returned';
  if (CANCELLED_STATUSES.has(o.status)) return 'cancelled';
  return null;
}

// The day an order "completed": its delivery date when delivered/exchanged/returned,
// otherwise (cancelled — no reliable cancellation timestamp) its created date. This
// is also the date the day navigator filters on.
function completionDateOf(o: AdminOrder): string {
  return o.deliveredAt ?? o.createdAt;
}

// Standalone Return orders live outside any GroupOrder, so wrap each one as a
// single-package pseudo group order to reuse one flattening path. The wrap folds
// deliveredToWarehouseAt into deliveredAt so the completion date resolves uniformly.
function wrapReturnAsGroupOrder(r: ReturnExchangeOrder): AdminGroupOrder {
  return {
    id: r.id,
    createdAt: r.createdAt,
    status: r.status as OrderStatus,
    customerId: r.customerId,
    senderFirstName: '',
    senderLastName: '',
    senderIdNumber: null,
    senderBusinessName: r.senderName,
    senderPhone: r.senderPhone,
    pickUpCity: r.returnPickupCity ?? r.recipientCity,
    pickUpDistrict: r.returnPickupDistrict ?? r.recipientDistrict,
    pickUpAddress: r.returnPickupAddress ?? r.recipientAddress,
    note: null,
    numberOfPackages: 1,
    whenPackagePickedUpDate: null,
    courierId: r.courierId,
    courierFullName: r.courierFullName,
    companyServiceCapitalPrice: null,
    companyServiceCityPrice: null,
    companyServiceDistrictPrice: null,
    orders: [{
      id: r.id,
      trackingNumber: r.trackingNumber,
      recipientName: r.recipientName,
      recipientPhone: r.recipientPhone,
      recipientCity: r.recipientCity,
      recipientDistrict: r.recipientDistrict,
      recipientAddress: r.recipientAddress,
      description: null,
      isFragile: false,
      orderType: 'Return',
      returnPickupAddress: r.returnPickupAddress,
      returnPickupCity: r.returnPickupCity,
      returnPickupDistrict: r.returnPickupDistrict,
      status: r.status as OrderStatus,
      productPaymentStatus: 'NotPaid',
      whoPaysForCompanyService: 'Sender',
      amountToCollectForPackage: null,
      amountOfCashCollected: null,
      companyServicePrice: r.companyServicePrice,
      isCompanyServicePriceIncluded: false,
      courierSalary: r.courierSalary,
      companyRevenue: null,
      courierId: r.courierId,
      createdAt: r.createdAt,
      deliveryDateFrom: null,
      deliveryDateTo: null,
      deliveredAt: r.deliveredAt ?? r.deliveredToWarehouseAt,
      cancelledReturnedToSenderAt: r.cancelledReturnedToSenderAt,
    }],
  };
}

// A single order flattened out of its (real or wrapped) group order, carrying the
// parent's sender info for display.
interface FlatHistoryOrder {
  order: AdminOrder;
  go: AdminGroupOrder;
  senderBusinessName: string;
  senderName: string;
  category: HistoryFilter;
  completedAt: string;
}

// Group orders are searched server-side; the standalone (wrapped) returns are not,
// so match them here — scoped to the same side (sender vs recipient) as the server query.
function returnMatchesSearch(go: AdminGroupOrder, term: string, party: 'sender' | 'recipient'): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (party === 'sender') {
    return go.senderBusinessName.toLowerCase().includes(q)
        || go.senderPhone.toLowerCase().includes(q)
        || go.pickUpCity.toLowerCase().includes(q)
        || go.pickUpDistrict.toLowerCase().includes(q)
        || go.pickUpAddress.toLowerCase().includes(q);
  }
  // recipient
  return go.orders.some(o =>
    o.recipientName.toLowerCase().includes(q) ||
    o.recipientPhone.toLowerCase().includes(q) ||
    o.recipientCity.toLowerCase().includes(q) ||
    o.recipientDistrict.toLowerCase().includes(q) ||
    o.recipientAddress.toLowerCase().includes(q) ||
    o.trackingNumber.toLowerCase().includes(q));
}

// A selected customer filter — id drives the server-side query, label is what's shown
// in the (typable) input once picked.
interface SelectedCustomer { id: string; label: string }

function customerLabel(c: AdminCustomer): string {
  return c.businessName || `${c.firstName} ${c.lastName}`.trim();
}

// Typable customer combobox: types free text, debounce-searches /api/customers, pick one
// to filter History server-side. Local to this page — not used elsewhere.
function CustomerTypeahead({ token, value, onChange }: {
  token: string;
  value: SelectedCustomer | null;
  onChange: (v: SelectedCustomer | null) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState(value?.label ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value?.label ?? ''); }, [value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      getCustomers(token, 1, 8, query.trim())
        .then(r => setResults(r.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, token]);

  const select = (c: AdminCustomer) => {
    onChange({ id: c.id, label: customerLabel(c) });
    setOpen(false);
  };

  const clear = () => { onChange(null); setQuery(''); };

  return (
    <div className="hist-cust" ref={rootRef}>
      <div className="hist-cust__box">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5.5" r="2.8" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          className="hist-cust__input"
          placeholder={t.histCustomerFilterPh}
          value={query}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); }}
        />
        {value && (
          <button type="button" className="hist-cust__clear" onClick={clear} aria-label="Clear">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="hist-cust__dropdown">
          {loading && <div className="hist-cust__empty">…</div>}
          {!loading && results.length === 0 && <div className="hist-cust__empty">{t.histCustomerFilterNoMatch}</div>}
          {!loading && results.map(c => (
            <button key={c.id} type="button" className="hist-cust__item" onClick={() => select(c)}>
              <span className="hist-cust__item-name">{customerLabel(c)}</span>
              <span className="hist-cust__item-sub">{c.phoneNumber}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminHistoryPage({ token, canSeeRevenue = true, initialSearch = '' }: { token: string; canSeeRevenue?: boolean; initialSearch?: string }) {
  const { t, lang } = useLanguage();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;

  const queryClient = useQueryClient();
  const [search,         setSearch]         = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  // Which side the free-text search matches: sender/customer (default) or recipient.
  const [searchParty,    setSearchParty]    = useState<'sender' | 'recipient'>('sender');
  const [customer,       setCustomer]       = useState<SelectedCustomer | null>(null);
  const [filterStatus,  setFilterStatus] = useState<HistoryFilter>('delivered');
  // Date navigator — filters by completion date (delivery date, or created date when
  // cancelled). `rangeFrom` is the single day / range start (defaults to today);
  // `rangeTo` (inclusive) widens it into a custom range, null = single day / All.
  // When deep-linked with a search term (Order Search "Go To"), open on All days so the
  // target order isn't hidden by the default single-day window.
  const [rangeFrom,     setRangeFrom]    = useState<Date | null>(() => initialSearch ? null : georgianToday());
  const [rangeTo,       setRangeTo]      = useState<Date | null>(null);
  const [viewingOrder,  setViewingOrder] = useState<AdminOrderItem | null>(null);
  const [page,          setPage]         = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group orders (batches) — search-filtered server-side by the debounced term.
  // keepPreviousData holds the last list on screen while a new search resolves,
  // and the shared query cache is persisted to IndexedDB, so a refresh repaints
  // instantly from last-known data instead of a spinner.
  const groupOrdersQuery = useQuery({
    queryKey: ['admin', 'history', 'groupOrders', debouncedSearch, searchParty, customer?.id ?? null] as const,
    queryFn: () => fetchGroupOrders(token, {
      search: debouncedSearch || undefined, party: searchParty, pageSize: 1000, customerId: customer?.id,
    }),
    placeholderData: keepPreviousData,
  });
  const groupOrders = groupOrdersQuery.data?.items ?? [];
  const loading = groupOrdersQuery.isPending;
  const error = groupOrdersQuery.isError
    ? (groupOrdersQuery.error instanceof Error ? groupOrdersQuery.error.message : 'Failed to load history.')
    : null;

  // Standalone Return orders are not part of any GroupOrder, so fetch them
  // separately and keep the terminal ones (returned to sender / cancelled).
  const returnOrdersQuery = useQuery({
    queryKey: ['admin', 'history', 'returnOrders'] as const,
    queryFn: async () => {
      const orders = await fetchReturnExchangeOrders(token);
      return orders
        .filter(o => o.orderType === 'Return'
          && (o.status === 'ReturnedToSender' || o.status === 'CancelledByAdmin'))
        .map(wrapReturnAsGroupOrder);
    },
  });
  const returnOrders = returnOrdersQuery.data ?? [];

  // Courier roster — only to resolve a last-mile courier's name for the View modal.
  const couriersQuery = useQuery({
    queryKey: ['admin', 'couriers'] as const,
    queryFn: () => fetchCouriers(token),
  });
  const couriers = couriersQuery.data ?? [];
  const courierNameById = useMemo(() => {
    const m = new Map<string, string>();
    couriers.forEach(c => m.set(c.courierId, c.fullName));
    return m;
  }, [couriers]);

  // Map a history order (+ its real/wrapped parent) into the AdminOrderItem the shared
  // ViewOrderModal expects, carrying the extra fields (cash collected, cancellation
  // reason/comment) that make the History view complete.
  const toOrderItem = (o: AdminOrder, go: AdminGroupOrder): AdminOrderItem => ({
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
    courierFullName: o.courierId ? (courierNameById.get(o.courierId) ?? go.courierFullName ?? null) : null,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    postponeReason: null,
    postponeComment: null,
    amountOfCashCollected: o.amountOfCashCollected,
    cancellationReason: o.cancellationReason ?? null,
    cancellationComment: o.cancellationComment ?? null,
  });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // ── Date navigator ────────────────────────────────────────────────────────
  // null `rangeFrom` = All days; otherwise an inclusive [fromKey..toKey] window.
  // Date keys are 'yyyy-MM-dd', so lexical comparison is chronological.
  const fromKey = rangeFrom ? toDateKey(rangeFrom) : null;
  const toKey   = rangeTo ? toDateKey(rangeTo) : fromKey;
  const inRange = useCallback(
    (iso: string) => { if (!fromKey) return true; const k = georgianDateKeyOf(iso); return k >= fromKey && k <= toKey!; },
    [fromKey, toKey],
  );

  // Flatten every terminal order out of its group/wrapped return. Group orders are
  // already search-filtered server-side; the wrapped returns are filtered here.
  const flatOrders = useMemo<FlatHistoryOrder[]>(() => {
    const result: FlatHistoryOrder[] = [];
    const all = [
      ...groupOrders,
      ...returnOrders.filter(go =>
        returnMatchesSearch(go, debouncedSearch, searchParty) && (!customer || go.customerId === customer.id)),
    ];
    for (const go of all) {
      for (const o of go.orders) {
        const category = orderCategory(o);
        if (!category) continue;
        result.push({
          order: o,
          go,
          senderBusinessName: go.senderBusinessName,
          senderName: `${go.senderFirstName} ${go.senderLastName}`.trim(),
          category,
          completedAt: completionDateOf(o),
        });
      }
    }
    return result;
  }, [groupOrders, returnOrders, debouncedSearch, searchParty, customer]);

  // Narrow to the selected completion day / range.
  const dayOrders = useMemo(
    () => flatOrders.filter(f => inRange(f.completedAt)),
    [flatOrders, inRange],
  );

  // Group orders (real batches, not standalone singles) that reached the warehouse on
  // the selected day — shows who picked them up. Search is already applied server-side.
  const pickedUpGroups = useMemo(
    () => groupOrders
      .filter(go => !go.isStandalone
                 && WAREHOUSE_STATUSES.has(go.status)
                 && inRange(pickedUpDateOf(go)))
      .sort((a, b) => new Date(pickedUpDateOf(b)).getTime() - new Date(pickedUpDateOf(a)).getTime()),
    [groupOrders, inRange],
  );

  const counts = useMemo(() => ({
    delivered: dayOrders.filter(f => f.category === 'delivered').length,
    cancelled: dayOrders.filter(f => f.category === 'cancelled').length,
    cancelledReturned: dayOrders.filter(f => f.category === 'cancelledReturned').length,
    returned:  dayOrders.filter(f => f.category === 'returned').length,
    exchanged: dayOrders.filter(f => f.category === 'exchanged').length,
    pickedup:  pickedUpGroups.length,
  }), [dayOrders, pickedUpGroups]);

  const visible = useMemo(
    () => dayOrders
      .filter(f => f.category === filterStatus)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [dayOrders, filterStatus],
  );

  // The "Group orders picked-up" category lists batches (not single orders), so it has
  // its own result set and table.
  const isPickedUp  = filterStatus === 'pickedup';
  const resultCount = isPickedUp ? pickedUpGroups.length : visible.length;

  // ── Pagination ──────────────────────────────────────────────────────────────
  // Reset to the first page whenever the result set changes (filter/search/range/customer).
  useEffect(() => { setPage(1); }, [filterStatus, debouncedSearch, searchParty, customer, fromKey, toKey]);

  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  // Guard against a stale page beyond the new result set (e.g. after narrowing a filter).
  const safePage   = Math.min(page, totalPages);
  const pageStart  = (safePage - 1) * PAGE_SIZE;
  const pagedVisible     = useMemo(() => visible.slice(pageStart, pageStart + PAGE_SIZE), [visible, pageStart]);
  const pagedPickedUp    = useMemo(() => pickedUpGroups.slice(pageStart, pageStart + PAGE_SIZE), [pickedUpGroups, pageStart]);

  // ── Mistaken-status correction (un-cancel / un-deliver) ─────────────────────
  // Delivered & cancelled orders only live here in History, so the admin fixes a
  // courier's mistake from this row. Send/Exchange only — Returns run a separate flow.
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [busyId,      setBusyId]      = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const correctionFor = (f: FlatHistoryOrder): 'UnCancel' | 'UnDeliver' | null => {
    if (f.order.orderType === 'Return') return null;
    if (f.category === 'cancelled') return 'UnCancel';
    if (f.category === 'delivered' || f.category === 'exchanged') return 'UnDeliver';
    return null;
  };

  const handleCorrect = async (orderId: string, correction: 'UnCancel' | 'UnDeliver') => {
    setBusyId(orderId);
    setActionError(null);
    try {
      await correctOrderStatus(token, orderId, correction);
      setConfirmId(null);
      // The corrected order leaves terminal status, so it drops out of History on reload.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'history'] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Correction failed.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Mark a cancelled order "returned to sender" ─────────────────────────────
  // The extra logistics step admins add onto an admin-cancelled / courier-declined
  // Send/Exchange order once the parcel is physically back with the sender.
  const [markConfirmId, setMarkConfirmId] = useState<string | null>(null);
  const [markBusyId,    setMarkBusyId]    = useState<string | null>(null);

  const canMarkReturned = (f: FlatHistoryOrder): boolean =>
    f.category === 'cancelled'
    && f.order.orderType !== 'Return'
    && (f.order.status === 'CancelledByAdmin' || f.order.status === 'OrderNotAccepted')
    // Markable whenever the order carries a cancellation reason (received then cancelled);
    // a null reason is a plain early cancel with nothing to hand back.
    && f.order.cancellationReason != null;

  const handleMarkReturned = async (orderId: string) => {
    setMarkBusyId(orderId);
    setActionError(null);
    try {
      await markCancelledReturnedToSender(token, orderId);
      setMarkConfirmId(null);
      // It now carries the marker, so it moves to the "Cancelled & Returned" pill on reload.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'history'] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to mark returned to sender.');
    } finally {
      setMarkBusyId(null);
    }
  };

  // Footer totals for the visible set.
  const totals = useMemo(() => visible.reduce((acc, f) => {
    const o = f.order;
    acc.cod     += o.amountToCollectForPackage ?? 0;
    acc.cash    += o.amountOfCashCollected ?? 0;
    acc.svc     += o.companyServicePrice ?? 0;
    acc.salary  += o.courierSalary ?? 0;
    acc.revenue += o.companyRevenue ?? 0;
    return acc;
  }, { cod: 0, cash: 0, svc: 0, salary: 0, revenue: 0 }), [visible]);

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>
      <style>{`
        .hist-daynav { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
        .hist-daynav__arrow { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); cursor: pointer; transition: all var(--transition); }
        .hist-daynav__arrow:hover { background: var(--color-bg-3); border-color: var(--color-text-subtle); }
        .hist-daynav__label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.92rem; font-weight: 700; color: var(--color-text); }
        .hist-daynav__today { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-accent); background: var(--color-accent-dim); border-radius: 100px; padding: 2px 8px; }
        .hist-daynav__jump { margin-left: 4px; background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.76rem; font-weight: 600; padding: 6px 12px; cursor: pointer; transition: all var(--transition); }
        .hist-daynav__jump:hover { background: var(--color-bg-3); color: var(--color-text); }
        .hist-daynav__arrow:disabled { opacity: 0.4; cursor: not-allowed; }
        .hist-daynav__date { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.82rem; font-weight: 600; padding: 5px 8px; cursor: pointer; font-family: inherit; }
        .hist-daynav__date:disabled { opacity: 0.5; cursor: not-allowed; }
        /* Excel-style bordered grid. border-collapse:separate keeps the sticky header's
           borders from vanishing on scroll; every cell carries right+bottom rules, the
           table's own left/top edges close the outer frame. */
        .hist-scroll { overflow-x: auto; }
        .hist-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: auto; font-variant-numeric: tabular-nums; }
        .hist-table th, .hist-table td { border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); padding: 7px 10px; vertical-align: middle; }
        .hist-table th:first-child, .hist-table td:first-child { border-left: 1px solid var(--color-border); }
        .hist-table thead th { border-top: 1px solid var(--color-border); }
        .hist-table th { text-align: left; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-subtle); background: var(--color-bg-3); white-space: nowrap; position: sticky; top: 0; z-index: 1; }
        .hist-table td { font-size: 0.8rem; color: var(--color-text); background: var(--color-bg-2); }
        .hist-table tbody tr:nth-child(even) td { background: var(--color-bg); }
        .hist-table tbody tr:hover td { background: var(--color-bg-3); }
        .hist-table th.num, .hist-table td.num { text-align: right; white-space: nowrap; }
        .hist-table .hist-totals td { background: var(--color-bg-3); font-weight: 700; font-size: 0.74rem; border-top: 2px solid var(--color-text-subtle); }
        .hist-table .hist-totals td:first-child { font-size: 0.66rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-subtle); }
        .hist-fix-btn { font-size: 0.72rem; font-weight: 600; padding: 4px 9px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-subtle); cursor: pointer; white-space: nowrap; transition: all var(--transition); }
        .hist-fix-btn:hover:not(:disabled) { background: var(--color-bg-3); color: var(--color-text); border-color: var(--color-text-subtle); }
        .hist-fix-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .hist-fix-btn--confirm { background: var(--color-accent-dim); color: var(--color-accent); border-color: rgba(196,127,23,0.4); }
        .hist-cust { position: relative; width: 240px; flex-shrink: 0; }
        .hist-cust__box { display: flex; align-items: center; gap: 6px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0 10px; color: var(--color-text-subtle); }
        .hist-cust__input { flex: 1; border: none; background: none; outline: none; padding: 7px 0; font-size: 0.82rem; color: var(--color-text); font-family: inherit; }
        .hist-cust__clear { display: inline-flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: var(--color-text-subtle); padding: 2px; }
        .hist-cust__clear:hover { color: var(--color-text); }
        .hist-cust__dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5; background: var(--color-bg-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,0.12); max-height: 260px; overflow-y: auto; }
        .hist-cust__item { display: flex; flex-direction: column; gap: 1px; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--color-border); padding: 8px 10px; cursor: pointer; font-family: inherit; }
        .hist-cust__item:last-child { border-bottom: none; }
        .hist-cust__item:hover { background: var(--color-bg-3); }
        .hist-cust__item-name { font-size: 0.82rem; font-weight: 600; color: var(--color-text); }
        .hist-cust__item-sub { font-size: 0.72rem; color: var(--color-text-subtle); }
        .hist-cust__empty { padding: 10px; font-size: 0.78rem; color: var(--color-text-subtle); text-align: center; }

        /* ── Mobile (≤768px) ── */
        @media (max-width: 768px) {
          .hist-daynav { padding: 10px 14px; }
          /* Search + customer typeahead take the full row so they aren't squeezed.
             The tables already scroll horizontally inside .hist-scroll. */
          .hist-cust { width: 100%; }
          .go-toolbar .go-search { flex-basis: 100%; max-width: none; }
        }
      `}</style>

      {/* Date navigator — All ↔ single day ↔ custom inclusive from→to range.
          Filters by completion (delivery) date. */}
      <DateRangeNav
        from={rangeFrom}
        to={rangeTo}
        onChange={(f, to) => { setRangeFrom(f); setRangeTo(to); }}
        classPrefix="hist-daynav"
      />

      {/* Search */}
      <div className="go-toolbar go-toolbar--search" style={{ gap: 10, alignItems: 'center' }}>
        {/* Search scope: match the typed term against the sender/customer or the recipient. */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
          {(['sender', 'recipient'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setSearchParty(p)}
              style={{
                padding: '7px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: searchParty === p ? 'var(--color-accent)' : 'transparent',
                color: searchParty === p ? '#fff' : 'var(--color-text-subtle)',
              }}
            >
              {p === 'sender' ? t.goSender : t.goThRecipient}
            </button>
          ))}
        </div>
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
        <CustomerTypeahead token={token} value={customer} onChange={setCustomer} />
        {!loading && !error && (
          <span className="go-count" style={{ marginLeft: 'auto' }}>
            {resultCount} {t.goOrdersMatched}
          </span>
        )}
      </div>

      {/* Status pills */}
      <div className="go-toolbar go-status-bar">
        <span className="go-filter-label">{t.goStatus}</span>
        {HISTORY_PILLS.map(({ value, labelKey }) => {
          const cnt = counts[value];
          return (
            <button
              key={value}
              className={`go-status-pill ${filterStatus === value ? 'go-status-pill--active' : ''}`}
              onClick={() => setFilterStatus(value)}
            >
              {t[labelKey as keyof typeof t] as string}
              {cnt > 0 && (
                <span style={{
                  marginLeft: 5,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: filterStatus === value ? 'rgba(196,127,23,0.25)' : 'var(--color-bg-3)',
                  borderRadius: '100px',
                  padding: '1px 6px',
                }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* States */}
      {loading && <div className="go-loading"><div className="go-spinner" />{t.goHistoryLoading}</div>}
      {!loading && error && <div className="go-error">{error}</div>}
      {actionError && <div className="go-error" style={{ margin: '10px 20px' }}>{actionError}</div>}
      {!loading && !error && resultCount === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{t.goHistoryNoMatch}</span>
        </div>
      )}

      {/* Group-orders picked-up: one row per batch brought to the warehouse, with courier */}
      {!loading && !error && isPickedUp && resultCount > 0 && (
        <div className="hist-scroll">
          <table className="hist-table">
            <thead>
              <tr>
                <th>{t.goSender}</th>
                <th>{t.cgoPickupLocation}</th>
                <th>{t.goThAddress}</th>
                <th>{t.histThCourier}</th>
                <th className="num">{t.goColPackages}</th>
                <th>{t.goThStatus}</th>
                <th className="num">{t.histThPickedUp}</th>
              </tr>
            </thead>
            <tbody>
              {pagedPickedUp.map(go => (
                <tr key={go.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{go.senderBusinessName || '—'}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{go.senderPhone}</div>
                  </td>
                  <td>
                    <div>{locCity(go.pickUpCity, go.pickUpCityGeo)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}</div>
                  </td>
                  <td style={{ color: 'var(--color-text-subtle)', fontSize: '0.78rem', whiteSpace: 'normal', maxWidth: 220 }}>{go.pickUpAddress}</td>
                  <td>{go.courierFullName ?? <span style={{ opacity: 0.35 }}>—</span>}</td>
                  <td className="num">{go.numberOfPackages}</td>
                  <td><StatusBadge status={go.status} /></td>
                  <td className="num" style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{formatDate(pickedUpDateOf(go))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flat single-order table */}
      {!loading && !error && !isPickedUp && visible.length > 0 && (
        <div className="hist-scroll">
          <table className="hist-table">
            <thead>
              <tr>
                <th>{t.goThTracking}</th>
                <th>{t.goSender}</th>
                <th>{t.goThRecipient}</th>
                <th>{t.goThCityDistrict}</th>
                <th>{t.goThStatus}</th>
                <th title="Product payment status">{t.goThPaid}</th>
                <th className="num" title="COD — cash to collect from recipient for product">COD ₾</th>
                <th className="num" title="Cash actually collected by courier">Collected ₾</th>
                <th className="num" title="Company service price">Svc ₾</th>
                <th className="num" title="Courier salary">Salary ₾</th>
                {canSeeRevenue && <th className="num" title="Company revenue">Revenue ₾</th>}
                <th className="num" title="Created date">Created</th>
                <th className="num" title="Completion (delivery) date">Completed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedVisible.map(f => {
                const o = f.order;
                const correction = correctionFor(f);
                return (
                  <tr key={o.id}>
                    <td><span className="tn-badge"><Highlight text={o.trackingNumber} term={debouncedSearch} /></span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}><Highlight text={f.senderBusinessName || '—'} term={debouncedSearch} /></div>
                      {f.senderName && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}><Highlight text={f.senderName} term={debouncedSearch} /></div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}><Highlight text={recipientDisplayName(o.recipientName, t.recipientUnknown)} term={debouncedSearch} /></div>
                      <div style={{ fontFamily: 'Courier New, monospace', fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                        <Highlight text={o.recipientPhone} term={debouncedSearch} />
                      </div>
                    </td>
                    <td>
                      <div>{locCity(o.recipientCity, o.recipientCityGeo)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                        {locDistrict(o.recipientDistrict, o.recipientDistrictGeo)}
                      </div>
                      {o.recipientAddress && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', maxWidth: 220, whiteSpace: 'normal' }}><Highlight text={o.recipientAddress} term={debouncedSearch} /></div>
                      )}
                    </td>
                    <td>
                      {/* Always show the real (cancelled/…) status. When the parcel was physically
                          handed back, append a green "Returned to Sender" chip (marker not null). */}
                      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <StatusBadge status={o.status} />
                        {o.cancelledReturnedToSenderAt && (
                          <span
                            className="status-badge status-badge--delivered"
                            title={formatDate(o.cancelledReturnedToSenderAt)}
                          >
                            {t.histReturnedToStore} · {formatDate(o.cancelledReturnedToSenderAt)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: o.productPaymentStatus === 'Paid' ? '#10b981' : '#ef4444',
                      }}>
                        {o.productPaymentStatus === 'Paid' ? t.goPaid : t.goUnpaid}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 600, color: '#d97706' }}>
                      {o.amountToCollectForPackage != null && o.amountToCollectForPackage > 0
                        ? `₾${o.amountToCollectForPackage.toFixed(2)}`
                        : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                    <td className="num" style={{ fontWeight: 600, color: '#16a34a' }}>
                      {o.amountOfCashCollected != null && o.amountOfCashCollected > 0
                        ? `₾${o.amountOfCashCollected.toFixed(2)}`
                        : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(o.companyServicePrice)}</td>
                    <td className="num" style={{ color: '#f97316', fontWeight: 600 }}>{money(o.courierSalary)}</td>
                    {canSeeRevenue && (
                    <td className="num" style={{
                      fontWeight: 600,
                      color: o.companyRevenue != null ? (o.companyRevenue >= 0 ? '#10b981' : '#ef4444') : undefined,
                    }}>
                      {money(o.companyRevenue)}
                    </td>
                    )}
                    <td className="num" style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="num" style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {o.deliveredAt ? formatDate(o.deliveredAt) : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="hist-fix-btn"
                        onClick={() => setViewingOrder(toOrderItem(o, f.go))}
                      >
                        {t.aopView}
                      </button>
                      {correction && (
                        confirmId === o.id ? (
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              type="button"
                              className="hist-fix-btn hist-fix-btn--confirm"
                              disabled={busyId === o.id}
                              onClick={() => void handleCorrect(o.id, correction)}
                            >
                              {busyId === o.id ? '…' : t.goConfirm}
                            </button>
                            <button
                              type="button"
                              className="hist-fix-btn"
                              disabled={busyId === o.id}
                              onClick={() => setConfirmId(null)}
                            >
                              {t.cancel}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="hist-fix-btn"
                            title={correction === 'UnCancel' ? t.eomConfirmUnCancel : t.eomConfirmUnDeliver}
                            onClick={() => { setConfirmId(o.id); setActionError(null); }}
                          >
                            {correction === 'UnCancel' ? t.histUnCancel : t.histUnDeliver}
                          </button>
                        )
                      )}
                      {canMarkReturned(f) && (
                        markConfirmId === o.id ? (
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              type="button"
                              className="hist-fix-btn hist-fix-btn--confirm"
                              disabled={markBusyId === o.id}
                              onClick={() => void handleMarkReturned(o.id)}
                            >
                              {markBusyId === o.id ? '…' : t.goConfirm}
                            </button>
                            <button
                              type="button"
                              className="hist-fix-btn"
                              disabled={markBusyId === o.id}
                              onClick={() => setMarkConfirmId(null)}
                            >
                              {t.cancel}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="hist-fix-btn"
                            title={t.histPillCancelledReturned}
                            onClick={() => { setMarkConfirmId(o.id); setActionError(null); }}
                          >
                            {t.histMarkReturned}
                          </button>
                        )
                      )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {visible.length > 1 && (
              <tfoot>
                <tr className="hist-totals">
                  <td colSpan={6}>Totals</td>
                  <td className="num">{totals.cod  > 0 ? `₾${totals.cod.toFixed(2)}`  : <span style={{ opacity: 0.35 }}>—</span>}</td>
                  <td className="num">{totals.cash > 0 ? `₾${totals.cash.toFixed(2)}` : <span style={{ opacity: 0.35 }}>—</span>}</td>
                  <td className="num">₾{totals.svc.toFixed(2)}</td>
                  <td className="num" style={{ color: '#f97316' }}>₾{totals.salary.toFixed(2)}</td>
                  {canSeeRevenue && <td className="num" style={{ color: totals.revenue >= 0 ? '#10b981' : '#ef4444' }}>₾{totals.revenue.toFixed(2)}</td>}
                  <td /><td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Pagination — rendered rows are capped at PAGE_SIZE; step through the rest. */}
      {!loading && !error && resultCount > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 20px' }}>
          <button
            type="button"
            className="hist-fix-btn"
            disabled={safePage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            {t.histPrevPage}
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, resultCount)} / {resultCount}
          </span>
          <button
            type="button"
            className="hist-fix-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            {t.histNextPage}
          </button>
        </div>
      )}

      {/* Full order view — reused from the Delivery page, with cash-collected +
          cancellation reason/comment shown when present. */}
      <ViewOrderModal order={viewingOrder} open={!!viewingOrder} onClose={() => setViewingOrder(null)} showRevenue={canSeeRevenue} />
    </div>
  );
}
