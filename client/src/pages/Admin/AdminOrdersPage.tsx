import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { setCourierSalary, setCompanyServicePrice, assignCourierToOrder, adminMarkOrderDelivered } from '../../api/orders';
import { assignReturnCourier } from '../../api/returnExchange';
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
import { printParcelLabels, type ParcelLabelData } from '../../utils/printLabel';
import { recipientDisplayName } from '../../utils/recipientName';
import { georgianToday, toDateKey } from '../../utils/georgianTime';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminOrderItem {
  id: string;
  trackingNumber: string;
  senderBusinessName: string;
  senderFirstName: string;
  senderLastName: string;
  senderPhone: string;
  alternativeSenderPhone: string | null;
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
}

interface PagedResult {
  items: AdminOrderItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAllOrders(
  token: string,
  params: {
    city?: string; district?: string; search?: string;
    courierId?: string; unpriced?: boolean; assigned?: boolean;
    date?: string; page?: number; pageSize?: number;
  }
): Promise<PagedResult> {
  const qs = new URLSearchParams();
  if (params.city)       qs.set('city',      params.city);
  if (params.district)   qs.set('district',  params.district);
  if (params.search)     qs.set('search',    params.search);
  if (params.courierId)  qs.set('courierId', params.courierId);
  if (params.unpriced)   qs.set('unpriced',  'true');
  if (params.assigned !== undefined) qs.set('assigned', String(params.assigned));
  if (params.date)       qs.set('date',      params.date);
  if (params.page)       qs.set('page',      String(params.page));
  if (params.pageSize)   qs.set('pageSize',  String(params.pageSize));
  const res = await fetch(`/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

async function fetchUnpricedCount(token: string, courierId?: string, date?: string): Promise<number> {
  const qs = new URLSearchParams({ unpriced: 'true', pageSize: '1', page: '1' });
  if (courierId) qs.set('courierId', courierId);
  if (date)      qs.set('date', date);
  const res = await fetch(`/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data: PagedResult = await res.json();
  return data.totalCount;
}

// Orders that can be (re)assigned to a courier from the Packages page: warehouse-ready
// and en-route-to-city Send/Exchange, an already-assigned delivery (re-assignment to a
// different courier), and Return orders still awaiting / in pickup assignment. Used by
// the select-all set, each row's checkbox, and the bulk-assign action so they stay in sync.
function isAssignable(o: AdminOrderItem): boolean {
  return o.status === 'AdminAcceptedOrderInWareHouse'
      || o.status === 'OrderIsOnItsWayToRecipientsCity'
      || o.status === 'CourierAssignedToDeliver'
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
// Send/Exchange orders that have reached the warehouse (last-mile flow). Orders still in
// the pickup flow must first be accepted into the warehouse on the Pick-Up page, so the
// pickup courier is recorded on the batch — otherwise that trace is lost. Return orders
// are excluded — their final leg is a warehouse drop-off, not a recipient delivery.
function isDeliverable(o: AdminOrderItem): boolean {
  return o.orderType !== 'Return' && LAST_MILE_STATUSES.includes(o.status);
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

// Build the Georgian parcel-sticker payload from an admin order row.
function buildAdminLabel(o: AdminOrderItem): ParcelLabelData {
  const due = recipientAmountDue(o);
  const city     = o.recipientCityGeo     || o.recipientCity;
  const district = o.recipientDistrictGeo || o.recipientDistrict;
  return {
    storeName:        o.senderBusinessName,
    recipientName:    recipientDisplayName(o.recipientName, 'უცნობი'),
    recipientPhone:   o.recipientPhone,
    recipientAddress: [o.recipientAddress, district, city].filter(Boolean).join(', '),
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

const PAGE_SIZE = 50;

export default function AdminOrdersPage({ token: tokenProp }: { token: string }) {
  const { token: authToken } = useAuth();
  const { t, lang } = useLanguage();
  const token = tokenProp || authToken || '';

  const [data,            setData]            = useState<PagedResult | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [search,          setSearch]          = useState('');
  // Packages view tab: 'pending' = orders with no courier yet, 'assigned' = courier set.
  const [assignTab,       setAssignTab]       = useState<'pending' | 'assigned'>('pending');
  const [filterCity,      setFilterCity]      = useState('');
  const [filterDistrict,  setFilterDistrict]  = useState('');
  const [filterCourier,   setFilterCourier]   = useState<Courier | null>(null);
  const [filterUnpriced,  setFilterUnpriced]  = useState(false);
  const [unpricedCount,   setUnpricedCount]   = useState<number | null>(null);
  // Day navigator — mirrors the Pick-Up page; filters by Order.CreatedAt (Georgian day).
  // null = show ALL days (default); a date filters to that single Georgian day.
  const [selectedDate,    setSelectedDate]    = useState<Date | null>(null);
  const [couriers,        setCouriers]        = useState<Courier[]>([]);
  const [page,            setPage]            = useState(1);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());

  const [showTracking,  setShowTracking]  = useState(false);
  const [showPrices,    setShowPrices]    = useState(true);

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef   = useRef({ city: '', district: '', search: '', courierId: '', unpriced: false, assigned: false, date: '' });

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchCouriers(token).then(setCouriers).catch(() => {});
  }, [token]);

  const refreshUnpricedCount = useCallback(async () => {
    const count = await fetchUnpricedCount(token, filterCourier?.courierId, selectedDate ? toDateKey(selectedDate) : undefined);
    setUnpricedCount(count);
  }, [token, filterCourier, selectedDate]);

  useEffect(() => { void refreshUnpricedCount(); }, [refreshUnpricedCount]);

  const load = useCallback(async (params: {
    city?: string; district?: string; search?: string;
    courierId?: string; unpriced?: boolean; assigned?: boolean; page?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      // Scope to the selected Georgian day when one is chosen; otherwise (null) show
      // every day. Threaded here so all reload paths honor the day navigator.
      const result = await fetchAllOrders(token, { ...params, date: selectedDate ? toDateKey(selectedDate) : undefined, pageSize: PAGE_SIZE });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.aopFailedLoad);
    } finally {
      setLoading(false);
    }
  }, [token, t, selectedDate]);

  useEffect(() => {
    const prev = filterRef.current;
    const next = {
      city:      filterCity,
      district:  filterDistrict,
      search,
      courierId: filterCourier?.courierId ?? '',
      unpriced:  filterUnpriced,
      assigned:  assignTab === 'assigned',
      date:      selectedDate ? toDateKey(selectedDate) : '',
    };

    const filterChanged =
      prev.city      !== next.city      ||
      prev.district  !== next.district  ||
      prev.search    !== next.search    ||
      prev.courierId !== next.courierId ||
      prev.unpriced  !== next.unpriced  ||
      prev.assigned  !== next.assigned  ||
      prev.date      !== next.date;

    filterRef.current = next;

    const delay = filterChanged && next.search !== prev.search ? 300 : 0;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const targetPage = filterChanged ? 1 : page;
      if (filterChanged && page !== 1)  setPage(1);
      if (filterChanged)                setSelected(new Set());

      void load({
        city:      filterCity     || undefined,
        district:  filterDistrict || undefined,
        search:    search         || undefined,
        courierId: filterCourier?.courierId,
        unpriced:  filterUnpriced || undefined,
        assigned:  assignTab === 'assigned',
        page:      targetPage,
      });
    }, delay);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCity, filterDistrict, search, filterCourier, filterUnpriced, assignTab, selectedDate, page, load]);

  const cities = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map(o => o.recipientCity))].sort();
  }, [data]);

  const districts = useMemo(() => {
    if (!data || !filterCity) return [];
    return [...new Set(
      data.items.filter(o => o.recipientCity === filterCity).map(o => o.recipientDistrict)
    )].sort();
  }, [data, filterCity]);

  const orders = data?.items ?? [];

  const selectableOrders = useMemo(() =>
    bulkMode === 'assign'  ? orders.filter(isAssignable)  :
    bulkMode === 'deliver' ? orders.filter(isDeliverable) :
    orders,
  [orders, bulkMode]);

  const allSelected  = selectableOrders.length > 0 && selectableOrders.every(o => selected.has(o.id));
  const someSelected = selected.size > 0;
  const toggleAll    = () => setSelected(allSelected ? new Set() : new Set(selectableOrders.map(o => o.id)));
  const toggleOne    = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Print parcel labels for the currently selected orders (same sticker as the customer side).
  const handlePrintLabels = () => {
    const labels = [...selected]
      .map(id => orders.find(o => o.id === id))
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
        load({ city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, assigned: assignTab === 'assigned', page }),
        refreshUnpricedCount(),
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
      .map(id => orders.find(o => o.id === id))
      .filter((o): o is AdminOrderItem => !!o);
    if (bulkMode === 'assign')  return picked.filter(isAssignable);
    if (bulkMode === 'deliver') return picked.filter(isDeliverable);
    return picked;
  }, [selected, orders, bulkMode]);

  const missingSalaryOrders = useMemo(() =>
    actionPool.filter(o => o.courierSalary == null),
  [actionPool]);

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
      const o = orders.find(x => x.id === id);
      return !!o && isAssignable(o);
    });
    let ok = 0; let fail = 0;
    await Promise.all(ids.map(async id => {
      const o = orders.find(x => x.id === id);
      try {
        if (o?.orderType === 'Return') {
          await assignReturnCourier(token, id, bulkCourierId);
        } else {
          await assignCourierToOrder(token, id, bulkCourierId);
        }
        ok++;
      }
      catch { fail++; }
    }));
    setBulkAssigning(false);
    // keep selection so user can immediately do Set Prices
    setBulkCourierId('');
    const reloadParams = { city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, assigned: assignTab === 'assigned', page };
    await Promise.all([load(reloadParams), refreshUnpricedCount()]);
    showToast(fail === 0 ? t.aopAssignedToast(ok)
                         : t.aopAssignedPartial(ok, fail), fail > 0 ? 'err' : 'ok');
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
      .map(id => orders.find(o => o.id === id))
      .filter((o): o is AdminOrderItem => !!o && isDeliverable(o));
    let ok = 0; let fail = 0;
    await Promise.all(targets.map(async o => {
      try {
        // Assign the chosen courier only when the order has none — never override an
        // existing assignee. Salary is already persisted by the salary modal above.
        await adminMarkOrderDelivered(token, o.id,
          !o.courierId && bulkCourierId ? { courierId: bulkCourierId } : undefined);
        ok++;
      }
      catch { fail++; }
    }));
    setBulkDelivering(false);
    setBulkCourierId('');
    setSelected(new Set());
    const reloadParams = { city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, assigned: assignTab === 'assigned', page };
    await Promise.all([load(reloadParams), refreshUnpricedCount()]);
    showToast(fail === 0 ? t.aopDeliveredToast(ok)
                         : t.aopDeliveredPartial(ok, fail), fail > 0 ? 'err' : 'ok');
  };

  const handleSalarySave = async () => {
    const toSave = [...salaryChecked].filter(id => {
      const val = parseFloat(salaryDrafts[id] ?? '');
      return !isNaN(val) && val >= 0;
    });
    if (toSave.length === 0) { setShowSalaryModal(false); return; }
    setSalarySaving(true);
    try {
      await Promise.all(toSave.map(id => setCourierSalary(token, id, parseFloat(salaryDrafts[id]))));
      const reloadParams = { city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, assigned: assignTab === 'assigned', page };
      await Promise.all([load(reloadParams), refreshUnpricedCount()]);
    } catch { /* best-effort */ }
    setSalarySaving(false);
    setShowSalaryModal(false);
    showToast(t.aopSalarySetToast(toSave.length));
  };

  const handlePriceSave = async () => {
    const toSave = [...priceChecked].filter(id => {
      const val = parseFloat(priceDrafts[id] ?? '');
      return !isNaN(val) && val >= 0;
    });
    if (toSave.length === 0) { setShowPriceModal(false); return; }
    setPriceSaving(true);
    try {
      await Promise.all(toSave.map(id => setCompanyServicePrice(token, id, parseFloat(priceDrafts[id]))));
      const reloadParams = { city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, assigned: assignTab === 'assigned', page };
      await Promise.all([load(reloadParams), refreshUnpricedCount()]);
    } catch { /* best-effort */ }
    setPriceSaving(false);
    setShowPriceModal(false);
    showToast(t.aopPriceSetToast(toSave.length));
  };

  const hasActiveFilters = filterCity || filterDistrict || search || filterCourier || filterUnpriced;
  const clearAll = () => {
    setFilterCity(''); setFilterDistrict(''); setSearch('');
    setFilterCourier(null); setFilterUnpriced(false);
  };

  // ── Day navigator (mirrors the Pick-Up page) ─────────────────────────────────
  // Arrows only step once a day is chosen; from "All" they fall back to today.
  const shiftDay = (delta: number) => setSelectedDate(prev => {
    const d = prev ? new Date(prev) : georgianToday();
    d.setDate(d.getDate() + delta); d.setHours(0, 0, 0, 0); return d;
  });
  const isToday = selectedDate != null && toDateKey(selectedDate) === toDateKey(georgianToday());

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="aop-root">

      {/* Day navigator — All by default; pick a day (or step with the arrows) to filter
          packages by the day they were placed (Order.CreatedAt). */}
      <div className="aop-daynav">
        <button className="aop-daynav__arrow" disabled={!selectedDate} onClick={() => shiftDay(-1)} aria-label={t.pickupPrevDay} title={t.pickupPrevDay}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="aop-daynav__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            type="date"
            className="aop-daynav__date"
            value={selectedDate ? toDateKey(selectedDate) : ''}
            max={toDateKey(georgianToday())}
            onChange={e => setSelectedDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)}
          />
          {!selectedDate
            ? <span className="aop-daynav__today">{t.aopAllDays}</span>
            : isToday && <span className="aop-daynav__today">{t.pickupToday}</span>}
        </div>
        <button className="aop-daynav__arrow" disabled={!selectedDate || isToday} onClick={() => shiftDay(1)} aria-label={t.pickupNextDay} title={t.pickupNextDay}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {selectedDate
          ? <button className="aop-daynav__jump" onClick={() => setSelectedDate(null)}>{t.aopShowAll}</button>
          : <button className="aop-daynav__jump" onClick={() => setSelectedDate(georgianToday())}>{t.pickupToday}</button>}
      </div>

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
        <label className="aop-col-toggle">
          <input type="checkbox" checked={showPrices} onChange={e => setShowPrices(e.target.checked)} />
          {t.aopShowPrices}
        </label>
      </div>

      {/* Toolbar */}
      <div className="aop-toolbar">
        <div className="go-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder={t.aopSearchPh}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="go-search-clear" onClick={() => setSearch('')}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

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
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <svg className="go-select-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        <div className="go-select-wrap">
          <select className="go-select" value={filterDistrict} disabled={!filterCity}
            onChange={e => setFilterDistrict(e.target.value)}>
            <option value="">{t.aopAllDistricts}</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
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

        <span className="go-count" style={{ marginLeft: 'auto' }}>
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

      {/* Mode toggle + bulk action bar */}
      {someSelected && (
        <div className="aop-bulk-bar">
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
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThRevenue}</th>
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
                          <td style={{ padding: '6px 8px' }}><span className="tn-badge">{o.trackingNumber}</span></td>
                          <td style={{ padding: '6px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{o.recipientCity}, {o.recipientDistrict}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientAddress}</div>
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
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                            {revenue !== null ? <span style={{ color: revenue >= 0 ? '#10b981' : '#ef4444' }}>₾{revenue.toFixed(2)}</span> : <span style={{ color: 'var(--color-text-subtle)' }}>—</span>}
                          </td>
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
                            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{o.recipientCity}, {o.recipientDistrict}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientAddress}</div>
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
                <th className="aop-th aop-th--check">
                  <input type="checkbox" className="aop-checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    title={allSelected ? t.aopDeselectAll : t.aopSelectAll}
                  />
                </th>
                {showTracking && <th className="aop-th">{t.aopThTracking}</th>}
                <th className="aop-th">{t.aopThSender}</th>
                <th className="aop-th">{t.aopThRecipient}</th>
                <th className="aop-th">{t.aopThPhone}</th>
                <th className="aop-th">{t.aopThCityDistrict}</th>
                <th className="aop-th">{t.aopThStatus}</th>
                <th className="aop-th aop-th--num">{t.aopThCod}</th>
                {showPrices && <th className="aop-th aop-th--num">{t.aopThSvcPrice}</th>}
                {showPrices && <th className="aop-th aop-th--num">{t.aopThSalary}</th>}
                {showPrices && <th className="aop-th aop-th--num">{t.aopThRevenue}</th>}
                <th className="aop-th">{t.aopThPaid}</th>
                <th className="aop-th">{t.aopThActions}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
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
                    onClick={() => selectable && toggleOne(order.id)}
                    style={!selectable ? { cursor: 'default' } : undefined}
                  >
                    <td className="aop-td aop-td--check" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="aop-checkbox" checked={isChecked}
                        disabled={!selectable}
                        onChange={() => selectable && toggleOne(order.id)}/>
                    </td>
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
                      <div className="aop-addr">{order.recipientAddress}</div>
                    </td>
                    <td className="aop-td aop-td--mono">{order.recipientPhone}</td>
                    <td className="aop-td">
                      <div className="aop-city">{lang === 'ka' && order.recipientCityGeo ? order.recipientCityGeo : order.recipientCity}</div>
                      <div className="aop-district">{lang === 'ka' && order.recipientDistrictGeo ? order.recipientDistrictGeo : order.recipientDistrict}</div>
                    </td>
                    <td className="aop-td">
                      <span
                        className="status-badge"
                        style={{ background: bg, color }}
                        title={statusMeta.description}
                      >
                        {statusMeta.short}
                      </span>
                      {order.courierFullName && (
                        <div className="aop-courier-name" title={order.courierFullName}>
                          {order.courierFullName}
                        </div>
                      )}
                      {order.status === 'DeliveryPostponed' && order.postponeReason && (
                        <div style={{ fontSize: '0.7rem', color: '#f97316', marginTop: 2 }}>
                          {t.cdPostponeReasons[order.postponeReason]}
                        </div>
                      )}
                    </td>
                    <td className="aop-td aop-td--num">
                      {order.amountToCollectForPackage != null
                        ? <span className="aop-price">₾{order.amountToCollectForPackage.toFixed(2)}</span>
                        : <span className="aop-price aop-price--empty">—</span>
                      }
                    </td>
                    {showPrices && (
                      <td className="aop-td aop-td--num">
                        {missingPrice
                          ? <span className="aop-missing">{t.aopNotSet}</span>
                          : <span className="aop-price">₾{order.companyServicePrice.toFixed(2)}</span>
                        }
                      </td>
                    )}
                    {showPrices && (
                      <td className="aop-td aop-td--num">
                        {missingSalary
                          ? <span className="aop-missing">{t.aopNotSet}</span>
                          : <span className="aop-price">₾{order.courierSalary!.toFixed(2)}</span>
                        }
                      </td>
                    )}
                    {showPrices && (
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
                      <button
                        onClick={() => setViewingOrder(order)}
                        style={{
                          padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600,
                          background: 'var(--color-bg-3)', color: 'var(--color-text-subtle)',
                          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {t.aopView}
                      </button>
                      <button
                        onClick={() => setEditingOrder(order)}
                        style={{
                          padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600,
                          background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                          border: '1px solid rgba(59,130,246,0.3)', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {t.aopEdit}
                      </button>
                    </td>
                  </tr>
                );
              })}
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
      />

      {/* Edit order modal */}
      <EditOrderModal
        order={editingOrder}
        open={editingOrder !== null}
        onClose={() => setEditingOrder(null)}
        onSaved={async () => {
          setEditingOrder(null);
          await load({ city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, page });
        }}
        token={token}
        canMarkDelivered={editingOrder != null && !['DeliveredToRecipient','ExchangeCompleted','DeliveredReturnOrderToWarehouse','ReturnedToSender','CancelledByAdmin','CancelledBySender','OrderNotAccepted','AllDelivered'].includes(editingOrder.status) && editingOrder.orderType !== 'Return'}
        canMarkWarehouse={editingOrder != null && !['DeliveredToRecipient','ExchangeCompleted','DeliveredReturnOrderToWarehouse','ReturnedToSender','CancelledByAdmin','CancelledBySender','OrderNotAccepted','AllDelivered'].includes(editingOrder.status) && editingOrder.orderType === 'Return'}
        couriers={couriers}
        onActioned={async () => {
          await load({ city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, page });
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

        /* ── Bulk bar ── */
        .aop-bulk-bar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 10px 20px; background: var(--color-accent-dim);
          border-bottom: 1px solid rgba(196,127,23,0.25);
          animation: expand-in 0.15s ease both;
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
        .aop-table-wrap { overflow-x: auto; flex: 1; }
        .aop-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .aop-th { text-align: left; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-subtle); padding: 10px 14px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); white-space: nowrap; position: sticky; top: 0; z-index: 1; }
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
      `}</style>
    </div>
  );
}
