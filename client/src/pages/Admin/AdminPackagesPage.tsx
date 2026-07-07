// ─────────────────────────────────────────────────────────────────────────────
// AdminPackagesPage — TEST page that UNITES the Pick-Up and Delivery pages into a
// single list. The spine is the Pick-Up customer-grouped accordion (it already
// lists every package through its whole lifecycle); the Delivery page's last-mile
// capabilities (selection, financial columns, bulk assign / set-prices / mark-
// delivered with the same price+salary gating, export, labels, courier + unpriced
// filters) are fused onto the package rows.
//
// This file is self-contained on purpose: the existing AdminOrders (Pick-Up) and
// AdminOrdersPage (Delivery) components are left untouched so they remain working
// recovery pages. Shared *leaf* components (AdminGroupOrderActions, AdminOrderRow-
// Actions, EditOrderModal, ViewOrderModal, Salary/Price warning modals) are reused
// by import; the small pickup-local helpers/modals are copied here verbatim.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { getStatusMeta } from '../../utils/statusMeta';
import { recipientDisplayName } from '../../utils/recipientName';
import { georgianToday, georgianDateKeyOf, toDateKey } from '../../utils/georgianTime';
import { printParcelLabels, type ParcelLabelData } from '../../utils/printLabel';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { isCompletedGroupOrder } from '../../utils/groupOrderUtils';
import { DateRangeNav } from '../../components/ui/DateRangeNav';
import {
  fetchGroupOrders, fetchPickupDay, fetchCustomerUnattached, attachOrdersToGroup,
  mergeGroupOrders, moveOrderToGroup, groupAndAcceptStandalone, groupAndWarehouseStandalone,
} from '../../api/adminGroupOrders';
import type { AdminGroupOrder, AdminOrder, PickupDayCustomer } from '../../api/adminGroupOrders';
import { fetchCouriers } from '../../api/couriers';
import type { Courier } from '../../api/couriers';
import {
  setCourierSalary, setCompanyServicePrice, assignCourierToOrder,
  adminMarkOrderDelivered, exportOrdersExcel,
} from '../../api/orders';
import { assignReturnCourier } from '../../api/returnExchange';
import { AdminGroupOrderActions, AdminOrderRowActions } from './AdminGroupOrderActions';
import { OrderRowActionsMenu } from './OrderRowActionsMenu';
import { EditOrderModal, type CustomerServicePricing } from './EditOrderModal';
import { ViewOrderModal } from './ViewOrderModal';
import { SalaryWarningModal } from './SalaryWarningModal';
import { PriceWarningModal } from './PriceWarningModal';
import type { AdminOrderItem } from './AdminOrdersPage';

// ── Constants copied from the Pick-Up page (AdminDashboard.tsx) ───────────────

const ACTIVE_ORDER_STATUSES_ONLY = new Set([
  'DeliveredToRecipient', 'CancelledBySender', 'CancelledByAdmin',
  'OrderNotAccepted', 'ReturnedToSender', 'ExchangeCompleted',
]);

const PICKUP_BUCKET: Record<string, number> = {
  Pending: 0, AcceptedGroupOrder: 0,
  CourierAssignedToPickUp: 1, CourierOnTheWayToPickUp: 1, CourierDeliveringToWarehouse: 1,
};
const pickupBucket = (groupStatus: string) => PICKUP_BUCKET[groupStatus] ?? 2;

const MERGEABLE_STATUSES = new Set(['Pending', 'AcceptedGroupOrder', 'CourierAssignedToPickUp', 'CourierOnTheWayToPickUp']);

const customerGroupKey = (go: AdminGroupOrder) =>
  `${go.customerId ?? `p:${go.senderPhone}`}|${go.pickUpCity}|${go.pickUpDistrict}|${go.pickUpAddress}`;

const ORDER_LEVEL_STATUSES = new Set([
  'OrderIsOnItsWayToRecipientsCity', 'CourierAssignedToDeliver',
  'CourierDeliveringTheOrderToRecipient', 'DeliveredToRecipient', 'CancelledByAdmin',
]);

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

const STATUS_CLASS_MAP: Record<string, string> = {
  Pending: 'pending', AcceptedGroupOrder: 'accepted', AcceptedOrder: 'accepted',
  CourierAssignedToPickUp: 'assigned', CourierOnTheWayToPickUp: 'onway',
  CourierDeliveringToWarehouse: 'delivering', DeliveredToWarehouse: 'warehouse',
  AdminAcceptedOrderInWareHouse: 'warehouse', OrderIsOnItsWayToRecipientsCity: 'onway',
  CourierAssignedToDeliver: 'assigned', CourierDeliveringTheOrderToRecipient: 'delivering',
  OrderIsBeingDeliveredToRecipient: 'delivering', DeliveredToRecipient: 'delivered',
  CancelledBySender: 'cancelled', CancelledByAdmin: 'cancelled', OrderNotAccepted: 'declined',
};

// ── Delivery-side helpers (copied from AdminOrdersPage.tsx) ───────────────────

const LAST_MILE_STATUSES = [
  'AdminAcceptedOrderInWareHouse', 'OrderIsOnItsWayToRecipientsCity',
  'CourierAssignedToDeliver', 'CourierDeliveringTheOrderToRecipient', 'DeliveryPostponed',
];

function isAssignable(o: AdminOrderItem): boolean {
  return o.status === 'AdminAcceptedOrderInWareHouse'
      || o.status === 'OrderIsOnItsWayToRecipientsCity'
      || o.status === 'CourierAssignedToDeliver'
      || (o.orderType === 'Return' && (o.status === 'Pending' || o.status === 'CourierAssignedToPickUp'));
}

function isDeliverable(o: AdminOrderItem): boolean {
  return o.orderType !== 'Return' && LAST_MILE_STATUSES.includes(o.status);
}

function recipientAmountDue(o: { productPaymentStatus: string; amountToCollectForPackage: number | null; whoPaysForCompanyService: string; companyServicePrice: number }): number {
  const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
  const fee = o.whoPaysForCompanyService === 'Recipient' ? (o.companyServicePrice ?? 0) : 0;
  return cod + fee;
}

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

function fmtDateTime(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Map a group order's package + its parent into the AdminOrderItem shape the delivery
// modals/actions expect. `courierFullName` is resolved from the couriers roster.
function toOrderItem(o: AdminOrder, go: AdminGroupOrder, courierName: string | null): AdminOrderItem {
  return {
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
    courierFullName: o.courierId ? courierName : null,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    postponeReason: null,
  };
}

// ── Status badge (copied) ─────────────────────────────────────────────────────

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

// ── Multi-district checkbox dropdown (copied) ─────────────────────────────────

interface DistrictMultiPickerProps {
  available: string[];
  selected: string[];
  onChange: (districts: string[]) => void;
  districtGeoMap: Record<string, string | undefined>;
  locDistrict: (en: string, geo?: string | null) => string;
  disabled?: boolean;
}

function DistrictMultiPicker({ available, selected, onChange, districtGeoMap, locDistrict, disabled }: DistrictMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (d: string) => onChange(selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d]);

  const label = selected.length === 0 ? 'All Districts'
    : selected.length === 1 ? locDistrict(selected[0], districtGeoMap[selected[0]])
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
          <span className="dmp-clear" role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange([]); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </span>
        )}
        <svg className="dmp-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && !disabled && (
        <div className="dmp-dropdown">
          <div className="dmp-dropdown-header">
            <span className="dmp-dropdown-title">Districts</span>
            <button className="dmp-select-all" onClick={() => onChange(selected.length === available.length ? [] : [...available])}>
              {selected.length === available.length ? 'Clear' : 'All'}
            </button>
          </div>
          <div className="dmp-list">
            {available.map(d => {
              const checked = selected.includes(d);
              return (
                <div key={d} className={`dmp-item${checked ? ' dmp-item--checked' : ''}`} onClick={() => toggle(d)}>
                  <input type="checkbox" className="dmp-checkbox" checked={checked} readOnly />
                  <span className="dmp-item-label">{locDistrict(d, districtGeoMap[d])}</span>
                  {checked && (
                    <svg className="dmp-item-check" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPackagesPage({ canManage = true, canAssignCourier = canManage, canGroup = canManage, canSeeRevenue = true }: { canManage?: boolean; canAssignCourier?: boolean; canGroup?: boolean; canSeeRevenue?: boolean }) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;

  // ── Pickup state (mirrors AdminOrders) ──────────────────────────────────────
  const [groupOrders, setGroupOrders] = useState<AdminGroupOrder[]>([]);
  const [couriers,    setCouriers]    = useState<Courier[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState('');
  const [filterParty,     setFilterParty]     = useState<'sender' | 'recipient'>('sender');
  const [filterCity,      setFilterCity]      = useState('');
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic id for the in-flight data load. Only the most recently issued request may
  // write to state, so a slow/stale response (initial load, realtime refetch) can never
  // overwrite a newer search — which otherwise made results flicker in then vanish.
  const loadSeqRef = useRef(0);

  const [selectedDate,     setSelectedDate]     = useState<Date | null>(null);
  const [rangeEnd,         setRangeEnd]         = useState<Date | null>(null);
  const [daySummary,       setDaySummary]       = useState<PickupDayCustomer[]>([]);
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
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [showTracking,  setShowTracking]  = useState(false);
  const [showPrices,    setShowPrices]    = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [viewingOrder,  setViewingOrder]  = useState<AdminOrderItem | null>(null);
  const [filterCourier, setFilterCourier] = useState<string>('');   // delivery courierId; '' = all
  const [filterUnpriced, setFilterUnpriced] = useState(false);

  type BulkMode = 'assign' | 'prices' | 'deliver';
  const [bulkMode,      setBulkMode]      = useState<BulkMode>('assign');
  const [bulkCourierId, setBulkCourierId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkDelivering,setBulkDelivering]= useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPrice,     setBulkPrice]     = useState('');
  const [bulkSalary,    setBulkSalary]    = useState('');
  const [bulkBusy,      setBulkBusy]      = useState(false);
  const [showSalaryWarning, setShowSalaryWarning] = useState(false);
  const [showSalaryModal,   setShowSalaryModal]   = useState(false);
  const [salaryDrafts,      setSalaryDrafts]      = useState<Record<string, string>>({});
  const [salaryChecked,     setSalaryChecked]     = useState<Set<string>>(new Set());
  const [salarySaving,      setSalarySaving]      = useState(false);
  const [showPriceWarning,  setShowPriceWarning]  = useState(false);
  const [showPriceModal,    setShowPriceModal]    = useState(false);
  const [priceDrafts,       setPriceDrafts]       = useState<Record<string, string>>({});
  const [priceChecked,      setPriceChecked]      = useState<Set<string>>(new Set());
  const [priceSaving,       setPriceSaving]       = useState(false);
  // After a price/salary save inside the assign/deliver gating, the original action is
  // resumed automatically (see the effect below) so the admin doesn't have to re-click
  // "Assign"/"Mark delivered" once the missing financials are filled in.
  const [resumeAction,      setResumeAction]      = useState<null | 'assign' | 'deliver'>(null);

  const showPricesEff = canManage && showPrices;
  // Revenue column additionally requires canSeeRevenue (hidden from operators).
  const showRevenueEff = showPricesEff && canSeeRevenue;

  // Grouping/summary stay anchored to a single day (the chosen "from" day, else today);
  // the optional range only widens which batches are listed.
  const effectiveDay    = selectedDate ?? georgianToday();
  const effectiveDayKey = toDateKey(effectiveDay);

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
      },
    });
  };

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async (term: string) => {
    const seq = ++loadSeqRef.current;
    try {
      const data = await fetchGroupOrders(token ?? '', term || undefined);
      if (seq !== loadSeqRef.current) return;   // a newer load started — drop this stale result
      setGroupOrders(data);
      setError(null);
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      setError(e instanceof Error ? e.message : t.goLoadingOrders);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [token]);

  const loadSummary = useCallback(async () => {
    try { setDaySummary(await fetchPickupDay(token ?? '', effectiveDayKey)); }
    catch { setDaySummary([]); }
  }, [token, effectiveDayKey]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void (async () => { setLoading(true); await load(''); })(); }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void (async () => { setLoading(true); await load(search); })(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, load]);

  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; });
  useOrdersChangedSignal(token ?? null, 'adminOrdersChanged', () => { void load(searchRef.current); void loadSummary(); });

  useEffect(() => { fetchCouriers(token ?? '').then(setCouriers).catch(() => {}); }, [token]);

  // After a delivery mutation: silently reload and clear the selection.
  const reloadAfterAction = useCallback(() => {
    void load(searchRef.current);
    void loadSummary();
    setSelected(new Set());
  }, [load, loadSummary]);

  // Esc leaves deliver mode (mirrors AdminOrdersPage).
  useEffect(() => {
    if (bulkMode !== 'deliver') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showBulkModal || showPriceModal || showSalaryModal || showPriceWarning || showSalaryWarning) return;
      setBulkMode('assign'); setSelected(new Set()); setBulkCourierId('');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bulkMode, showBulkModal, showPriceModal, showSalaryModal, showPriceWarning, showSalaryWarning]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handlePartyChange = (party: 'sender' | 'recipient') => { setFilterParty(party); setFilterCity(''); setFilterDistricts([]); };
  const handleCityChange  = (city: string) => { setFilterCity(city); setFilterDistricts([]); };

  // ── Derived: cities / districts / geo maps (copied) ─────────────────────────
  const availableCities = useMemo(() => {
    if (filterParty === 'sender') return [...new Set(groupOrders.map(go => go.pickUpCity))].sort();
    return [...new Set(groupOrders.flatMap(go => go.orders.map(o => o.recipientCity)))].sort();
  }, [groupOrders, filterParty]);

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

  // Unpriced badge — packages (non-terminal) with no company service price set.
  const unpricedCount = useMemo(() =>
    groupOrders.reduce((sum, go) => sum + go.orders.filter(o =>
      !ACTIVE_ORDER_STATUSES_ONLY.has(o.status) && !o.companyServicePrice).length, 0),
  [groupOrders]);

  // ── Delivery-side per-package predicate (courier + unpriced filters) ────────
  const matchesDeliveryFilters = useCallback((o: AdminOrder) => {
    if (filterCourier && o.courierId !== filterCourier) return false;
    if (filterUnpriced && o.companyServicePrice) return false;
    return true;
  }, [filterCourier, filterUnpriced]);

  // ── Visible group orders (copied + delivery filters folded in) ──────────────
  const visibleOrders = useMemo(() => {
    return groupOrders.filter(go => {
      if (isCompletedGroupOrder(go)) return false;
      if (filterStatus) {
        if (ORDER_LEVEL_STATUSES.has(filterStatus)) {
          if (!go.orders.some(o => o.status === filterStatus)) return false;
        } else if (go.status !== filterStatus) return false;
      }
      // When a delivery courier / unpriced filter is on, keep only batches with a matching package.
      if ((filterCourier || filterUnpriced) && !go.orders.some(matchesDeliveryFilters)) return false;
      if (!filterCity && filterDistricts.length === 0) return true;
      if (filterParty === 'sender') {
        if (filterCity && go.pickUpCity !== filterCity) return false;
        if (filterDistricts.length > 0 && !filterDistricts.includes(go.pickUpDistrict)) return false;
        return true;
      }
      return go.orders.some(o => {
        if (filterCity && o.recipientCity !== filterCity) return false;
        if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
        return true;
      });
    });
  }, [groupOrders, filterStatus, filterCity, filterDistricts, filterParty, filterCourier, filterUnpriced, matchesDeliveryFilters]);

  // Date filter: null = All; a single day; or an inclusive [from..to] range. Date keys are
  // 'yyyy-MM-dd', so lexical string comparison is chronological.
  const dayKey   = selectedDate ? toDateKey(selectedDate) : null;
  const dayKeyTo = rangeEnd ? toDateKey(rangeEnd) : dayKey;
  const dayOrders = useMemo(
    () => (dayKey
      ? visibleOrders.filter(go => { const k = georgianDateKeyOf(go.createdAt); return k >= dayKey && k <= dayKeyTo!; })
      : visibleOrders),
    [visibleOrders, dayKey, dayKeyTo],
  );

  const mergeableByCustomer = useMemo(() => {
    const m = new Map<string, AdminGroupOrder[]>();
    for (const go of groupOrders) {
      if (go.isStandalone || !go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== effectiveDayKey) continue;
      if (!MERGEABLE_STATUSES.has(go.status)) continue;
      const arr = m.get(go.customerId);
      if (arr) arr.push(go); else m.set(go.customerId, [go]);
    }
    for (const arr of m.values())
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return m;
  }, [groupOrders, effectiveDayKey]);

  const batchesFor = useCallback((customerId: string, dKey: string) =>
    groupOrders
      .filter(b => !b.isStandalone && b.customerId === customerId
        && georgianDateKeyOf(b.createdAt) === dKey && MERGEABLE_STATUSES.has(b.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  [groupOrders]);

  const groupedCustomers = useMemo(() => {
    const m = new Map<string, string>();
    for (const go of dayOrders) if (go.customerId) m.set(go.customerId, go.senderBusinessName);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [dayOrders]);

  const listOrders = useMemo(
    () => (customerFilter ? dayOrders.filter(go => go.customerId === customerFilter) : dayOrders),
    [dayOrders, customerFilter],
  );

  const multiBatchCustomers = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const go of groupOrders) {
      if (go.isStandalone || !go.customerId) continue;
      if (georgianDateKeyOf(go.createdAt) !== effectiveDayKey) continue;
      const e = counts.get(go.customerId);
      if (e) e.n += 1; else counts.set(go.customerId, { name: go.senderBusinessName, n: 1 });
    }
    return [...counts.entries()].filter(([, v]) => v.n >= 2)
      .map(([id, v]) => ({ id, name: v.name, count: v.n }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupOrders, effectiveDayKey]);

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
    return groupOrders
      .filter(go => !!go.customerId && ids.has(go.customerId)
        && georgianDateKeyOf(go.createdAt) === effectiveDayKey
        && (!ungroupedCustomerFilter || go.customerId === ungroupedCustomerFilter))
      .sort((a, b) => a.customerId !== b.customerId
        ? a.senderBusinessName.localeCompare(b.senderBusinessName)
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [groupOrders, effectiveDayKey, ungroupedCustomers, ungroupedCustomerFilter]);

  const displayList = pickupMode === 'ungrouped' ? ungroupedListOrders : listOrders;

  const hasLocationFilter = filterCity || filterDistricts.length > 0;
  const hasFilters = search || hasLocationFilter || filterStatus || filterCourier || filterUnpriced;
  const clearAll = () => {
    setSearch(''); setFilterCity(''); setFilterDistricts([]); setFilterStatus('');
    setFilterCourier(''); setFilterUnpriced(false);
  };

  // Active packages of a batch matching the recipient location AND delivery filters.
  const visibleOrdersFor = useCallback((go: AdminGroupOrder) => {
    let orders = go.orders.filter(o => !ACTIVE_ORDER_STATUSES_ONLY.has(o.status));
    if (filterCourier || filterUnpriced) orders = orders.filter(matchesDeliveryFilters);
    if (pickupMode === 'ungrouped' || filterParty !== 'recipient' || (!filterCity && filterDistricts.length === 0)) return orders;
    return orders.filter(o => {
      if (filterCity && o.recipientCity !== filterCity) return false;
      if (filterDistricts.length > 0 && !filterDistricts.includes(o.recipientDistrict)) return false;
      return true;
    });
  }, [pickupMode, filterParty, filterCity, filterDistricts, filterCourier, filterUnpriced, matchesDeliveryFilters]);

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

  // ── Selection / bulk pool ───────────────────────────────────────────────────
  // Flat list of every package currently shown, as AdminOrderItem. Drives selection,
  // select-all and the bulk-action pool. Built from displayList so it follows filters.
  const visibleItems = useMemo(() => {
    const out: AdminOrderItem[] = [];
    for (const go of displayList) {
      for (const o of visibleOrdersFor(go)) {
        out.push(toOrderItem(o, go, o.courierId ? (courierNameById.get(o.courierId) ?? null) : null));
      }
    }
    return out;
  }, [displayList, visibleOrdersFor, courierNameById]);

  const itemById = useMemo(() => {
    const m = new Map<string, AdminOrderItem>();
    visibleItems.forEach(it => m.set(it.id, it));
    return m;
  }, [visibleItems]);

  const selectableOrders = useMemo(() =>
    bulkMode === 'assign'  ? visibleItems.filter(isAssignable)  :
    bulkMode === 'deliver' ? visibleItems.filter(isDeliverable) :
    visibleItems,
  [visibleItems, bulkMode]);

  const allSelected  = selectableOrders.length > 0 && selectableOrders.every(o => selected.has(o.id));
  const someSelected = selected.size > 0;
  const toggleAll    = () => setSelected(allSelected ? new Set() : new Set(selectableOrders.map(o => o.id)));
  const toggleOne    = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const rowSelectable = (o: AdminOrderItem) =>
    bulkMode === 'assign' ? isAssignable(o) : bulkMode === 'deliver' ? isDeliverable(o) : true;

  // Per-batch select-all: the ids of just this expanded group order's currently-selectable
  // packages (respecting the active bulk mode + location/delivery filters). Toggling scopes
  // selection to exactly this batch instead of every visible package.
  const groupSelectableIds = (go: AdminGroupOrder) =>
    visibleOrdersFor(go).filter(o => rowSelectable(toOrderItem(o, go, null))).map(o => o.id);

  const toggleGroupAll = (go: AdminGroupOrder) => {
    const ids = groupSelectableIds(go);
    if (ids.length === 0) return;
    setSelected(prev => {
      const allIn = ids.every(id => prev.has(id));
      const next = new Set(prev);
      ids.forEach(id => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const actionPool = useMemo(() => {
    const picked = [...selected].map(id => itemById.get(id)).filter((o): o is AdminOrderItem => !!o);
    if (bulkMode === 'assign')  return picked.filter(isAssignable);
    if (bulkMode === 'deliver') return picked.filter(isDeliverable);
    return picked;
  }, [selected, itemById, bulkMode]);

  const missingSalaryOrders  = useMemo(() => actionPool.filter(o => o.courierSalary == null), [actionPool]);
  const missingPriceOrders   = useMemo(() => actionPool.filter(o => !o.companyServicePrice), [actionPool]);
  const missingCourierOrders = useMemo(() => actionPool.filter(o => !o.courierId), [actionPool]);

  // ── Export / labels ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportOrdersExcel(token ?? '', {
        city:      filterCity || undefined,
        district:  filterDistricts.length === 1 ? filterDistricts[0] : undefined,
        search:    search || undefined,
        courierId: filterCourier || undefined,
        unpriced:  filterUnpriced || undefined,
        date:      selectedDate ? toDateKey(selectedDate) : undefined,
        dateTo:    rangeEnd ? toDateKey(rangeEnd) : undefined,
        ids:       selected.size > 0 ? [...selected] : undefined,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintLabels = () => {
    const labels = [...selected].map(id => itemById.get(id)).filter((o): o is AdminOrderItem => !!o).map(buildAdminLabel);
    void printParcelLabels(labels);
  };

  // ── Bulk set prices/salary (Prices mode quick row) ──────────────────────────
  const handleBulkApply = async () => {
    const price  = bulkPrice  ? parseFloat(bulkPrice)  : null;
    const salary = bulkSalary ? parseFloat(bulkSalary) : null;
    if ((price !== null && (isNaN(price) || price < 0)) || (salary !== null && (isNaN(salary) || salary < 0))) return;
    if (price === null && salary === null) return;
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.flatMap(id => [
        ...(price  !== null ? [setCompanyServicePrice(token ?? '', id, price)] : []),
        ...(salary !== null ? [setCourierSalary(token ?? '', id, salary)] : []),
      ]));
      const parts = [
        price  !== null ? `${t.aopBulkSvcLabel} ₾${price.toFixed(2)}`  : '',
        salary !== null ? `${t.aopBulkSalLabel} ₾${salary.toFixed(2)}` : '',
      ].filter(Boolean).join(' + ');
      showToast(t.aopBulkApplied(parts, ids.length));
      setShowBulkModal(false); setBulkPrice(''); setBulkSalary('');
      reloadAfterAction();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setBulkBusy(false);
    }
  };
  const cancelBulk = () => { setShowBulkModal(false); setBulkPrice(''); setBulkSalary(''); };

  // ── Assign courier ──────────────────────────────────────────────────────────
  const handleBulkAssign = async () => {
    if (!bulkCourierId || selected.size === 0) return;
    if (missingPriceOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingPriceOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setPriceDrafts(drafts); setPriceChecked(checked); setShowPriceWarning(true); return;
    }
    if (missingSalaryOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingSalaryOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setSalaryDrafts(drafts); setSalaryChecked(checked); setShowSalaryWarning(true); return;
    }
    await doAssign();
  };

  const doAssign = async () => {
    setBulkAssigning(true);
    const ids = [...selected].filter(id => { const o = itemById.get(id); return !!o && isAssignable(o); });
    let ok = 0, fail = 0;
    await Promise.all(ids.map(async id => {
      const o = itemById.get(id);
      try {
        if (o?.orderType === 'Return') await assignReturnCourier(token ?? '', id, bulkCourierId);
        else await assignCourierToOrder(token ?? '', id, bulkCourierId);
        ok++;
      } catch { fail++; }
    }));
    setBulkAssigning(false); setBulkCourierId('');
    reloadAfterAction();
    showToast(fail === 0 ? t.aopAssignedToast(ok) : t.aopAssignedPartial(ok, fail), fail > 0 ? 'err' : 'ok');
  };

  // ── Mark delivered ──────────────────────────────────────────────────────────
  const handleBulkDeliver = async () => {
    if (actionPool.length === 0) { showToast(t.aopNoDeliverable, 'err'); return; }
    if (missingPriceOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingPriceOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setPriceDrafts(drafts); setPriceChecked(checked); setShowPriceWarning(true); return;
    }
    if (missingSalaryOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingSalaryOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setSalaryDrafts(drafts); setSalaryChecked(checked); setShowSalaryWarning(true); return;
    }
    if (missingCourierOrders.length > 0 && !bulkCourierId) { showToast(t.aopChooseCourierFirst, 'err'); return; }
    await doDeliver();
  };

  const doDeliver = async () => {
    setBulkDelivering(true);
    const targets = [...selected].map(id => itemById.get(id)).filter((o): o is AdminOrderItem => !!o && isDeliverable(o));
    let ok = 0, fail = 0;
    await Promise.all(targets.map(async o => {
      try {
        await adminMarkOrderDelivered(token ?? '', o.id, !o.courierId && bulkCourierId ? { courierId: bulkCourierId } : undefined);
        ok++;
      } catch { fail++; }
    }));
    setBulkDelivering(false); setBulkCourierId('');
    reloadAfterAction();
    showToast(fail === 0 ? t.aopDeliveredToast(ok) : t.aopDeliveredPartial(ok, fail), fail > 0 ? 'err' : 'ok');
  };

  const handleSalarySave = async () => {
    const toSave = [...salaryChecked].filter(id => { const v = parseFloat(salaryDrafts[id] ?? ''); return !isNaN(v) && v >= 0; });
    if (toSave.length === 0) { setShowSalaryModal(false); return; }
    setSalarySaving(true);
    let saved = false;
    // Await the reload so the resume below re-checks gating against fresh orders.
    try { await Promise.all(toSave.map(id => setCourierSalary(token ?? '', id, parseFloat(salaryDrafts[id])))); await load(searchRef.current); saved = true; }
    catch { /* best-effort */ }
    setSalarySaving(false); setShowSalaryModal(false);
    showToast(t.aopSalarySetToast(toSave.length));
    // Resume the action that opened this modal — it commits when nothing is missing or
    // re-prompts otherwise, so the admin never has to click "Assign" a second time.
    if (saved) setResumeAction(bulkMode === 'deliver' ? 'deliver' : 'assign');
  };

  const handlePriceSave = async () => {
    const toSave = [...priceChecked].filter(id => { const v = parseFloat(priceDrafts[id] ?? ''); return !isNaN(v) && v >= 0; });
    if (toSave.length === 0) { setShowPriceModal(false); return; }
    setPriceSaving(true);
    let saved = false;
    try { await Promise.all(toSave.map(id => setCompanyServicePrice(token ?? '', id, parseFloat(priceDrafts[id])))); await load(searchRef.current); saved = true; }
    catch { /* best-effort */ }
    setPriceSaving(false); setShowPriceModal(false);
    showToast(t.aopPriceSetToast(toSave.length));
    // Resume the original action — advances to the salary step (or commits) without a click.
    if (saved) setResumeAction(bulkMode === 'deliver' ? 'deliver' : 'assign');
  };

  // Resume the assign/deliver action after a price/salary save, once no gating dialog is
  // open. Re-running the entry handler re-evaluates the gating against the freshly loaded
  // orders: it commits when nothing is missing, or re-prompts for whatever is still
  // missing (e.g. salary right after prices) — so no second "Assign" click is needed.
  useEffect(() => {
    if (!resumeAction) return;
    if (showSalaryWarning || showSalaryModal || showPriceWarning || showPriceModal) return;
    const action = resumeAction;
    setResumeAction(null);
    if (action === 'deliver') void handleBulkDeliver();
    else void handleBulkAssign();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAction, showSalaryWarning, showSalaryModal, showPriceWarning, showPriceModal]);

  // ── Render: one package row (shared by accordion + flat view) ───────────────
  const renderOrderRow = (o: AdminOrder, go: AdminGroupOrder, moveDestinations: AdminGroupOrder[], warehouseSelectable = false, showStore = false) => {
    const selectable = canManage && rowSelectable(toOrderItem(o, go, null));
    const isChecked = selected.has(o.id);
    const courierName = o.courierId ? (courierNameById.get(o.courierId) ?? null) : null;
    const menuItem = toOrderItem(o, go, courierName);
    return (
      <tr key={o.id} className={isChecked ? 'pkg-row--selected' : ''}>
        {canManage && (
          <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <input type="checkbox" className="aop-checkbox" checked={isChecked} disabled={!selectable}
              onChange={() => selectable && toggleOne(o.id)} />
          </td>
        )}
        {showTracking && (
          <td>
            <span className="tn-badge">{o.trackingNumber}</span>
            {warehouseSelectable && canManage && o.status === 'DeliveredToWarehouse' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: 'var(--color-text-subtle)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" style={{ cursor: 'pointer' }}
                  checked={!absentPkgs.has(o.id)}
                  onChange={() => togglePkgPresent(o.id)} />
                {t.goWarehousePresent}
              </label>
            )}
          </td>
        )}
        {showStore && (
          <td>
            <div style={{ fontWeight: 600 }}>{go.senderBusinessName || '—'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{go.senderFirstName} {go.senderLastName}</div>
          </td>
        )}
        <td>
          <div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div>
          <div style={{ fontFamily: 'Courier New, monospace', fontSize: '0.74rem', color: 'var(--color-text-subtle)' }}>{o.recipientPhone}</div>
        </td>
        <td>
          <div>{locCity(o.recipientCity, o.recipientCityGeo)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{locDistrict(o.recipientDistrict, o.recipientDistrictGeo)}</div>
        </td>
        <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{o.recipientAddress}</td>
        <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 160 }}>{o.description ?? <span style={{ opacity: 0.4 }}>—</span>}</td>
        <td>
          <StatusBadge status={o.status} />
          {/* Delivery-courier / assignment indicator (from the Delivery page). */}
          <div className="aop-courier-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={courierName ?? t.vomUnassigned}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M3 8.5l3.5 3.5L13 5" stroke={o.courierId ? '#10b981' : '#ef4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={o.courierId ? undefined : { color: '#ef4444' }}>{courierName ?? t.vomUnassigned}</span>
          </div>
          {o.deliveredAt && (
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
              {t.aopDeliveredAt} · {fmtDateTime(o.deliveredAt, lang)}
            </div>
          )}
        </td>
        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {(() => {
            // What the courier actually collects from the recipient: the product COD
            // (only when unpaid) plus the company service fee (only when the recipient
            // pays it). Shown stacked — COD, + fee, = total — when both parts apply.
            const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
            const fee = o.whoPaysForCompanyService === 'Recipient' ? (o.companyServicePrice ?? 0) : 0;
            const total = cod + fee;
            if (total <= 0) return <span style={{ opacity: 0.4 }}>—</span>;
            // Only break the figure apart when both a product COD and a recipient-paid
            // fee are collected; a single component is just shown as its own amount.
            // Operators (no canManage) must not see the service fee — they get the total only.
            if (!canManage || !(cod > 0 && fee > 0)) return <span>₾{total.toFixed(2)}</span>;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3, alignItems: 'flex-start' }}>
                <span>{t.goCodLbl} ₾{cod.toFixed(2)}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--color-text-subtle)' }}>{t.goFeeLbl} ₾{fee.toFixed(2)}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 1, marginTop: 1 }}>{t.goTotalLbl} ₾{total.toFixed(2)}</span>
              </div>
            );
          })()}
        </td>
        {showPricesEff && (
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {!o.companyServicePrice ? <span className="aop-missing">{t.aopNotSet}</span> : <span className="aop-price">₾{o.companyServicePrice.toFixed(2)}</span>}
          </td>
        )}
        {showPricesEff && (
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {o.courierSalary == null ? <span className="aop-missing">{t.aopNotSet}</span> : <span className="aop-price">₾{o.courierSalary.toFixed(2)}</span>}
          </td>
        )}
        {showRevenueEff && (
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {o.companyRevenue != null ? <span className="aop-price">₾{o.companyRevenue.toFixed(2)}</span> : <span style={{ opacity: 0.4 }}>—</span>}
          </td>
        )}
        <td>
          {o.productPaymentStatus === 'Paid' ? (
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>{t.goPaid}</span>
          ) : (() => {
            const courierDue = o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;
            const sub = o.productPaymentStatus === 'NotPaid' && courierDue ? t.goSubParcelAndFee : courierDue ? t.goSubFeeOnly : t.goSubParcelOnly;
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
            <OrderRowActionsMenu
              order={menuItem}
              couriers={couriers}
              token={token ?? ''}
              canManage={canManage}
              canAssign={isAssignable(menuItem)}
              canDeliver={isDeliverable(menuItem)}
              onView={() => setViewingOrder(menuItem)}
              onEdit={() => openEditOrder(o, go)}
              onLabel={() => void printParcelLabels([buildAdminLabel(menuItem)])}
              onChanged={() => load(searchRef.current)}
              onError={msg => showToast(msg, 'err')}
            />
            {/* Edit + Label now live in the kebab menu above; this keeps the pickup-only
                actions (send-to-city, cancel). */}
            <AdminOrderRowActions order={o} storeName={go.senderBusinessName} couriers={couriers} token={token ?? ''}
              onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
              onRefresh={() => load(searchRef.current)}
              canManage={canManage}
              showLabel={false} />
            {canGroup && moveDestinations.length > 0 && (
              <MoveOrderControl orderId={o.id} destinations={moveDestinations} token={token ?? ''}
                onMoved={() => { void load(searchRef.current); void loadSummary(); showToast(t.pickupMovedToast); }}
                onError={msg => showToast(msg, 'err')} />
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Shared <thead> for the package tables. `showStore` adds a Sender/store column —
  // used in the flat (recipient + location) single-order view where the batch's sender
  // isn't otherwise visible.
  const packageHead = (showStore = false, selectAllGo?: AdminGroupOrder) => (
    <thead>
      <tr>
        {canManage && (
          <th style={{ width: 36 }}>
            {selectAllGo && (() => {
              const ids = groupSelectableIds(selectAllGo);
              const allIn  = ids.length > 0 && ids.every(id => selected.has(id));
              const someIn = ids.some(id => selected.has(id));
              return (
                <input type="checkbox" className="aop-checkbox" checked={allIn} disabled={ids.length === 0}
                  ref={el => { if (el) el.indeterminate = someIn && !allIn; }}
                  onChange={() => toggleGroupAll(selectAllGo)} />
              );
            })()}
          </th>
        )}
        {showTracking && <th>{t.goThTracking}</th>}
        {showStore && <th>{t.goSender}</th>}
        <th>{t.goThRecipient}</th>
        <th>{t.goThCityDistrict}</th>
        <th>{t.goThAddress}</th>
        <th>{t.goThDescription}</th>
        <th>{t.goThStatus}</th>
        <th>{t.goThCollect}</th>
        {showPricesEff && <th style={{ textAlign: 'right' }}>{t.aopThSvcPrice}</th>}
        {showPricesEff && <th style={{ textAlign: 'right' }}>{t.aopThSalary}</th>}
        {showRevenueEff && <th style={{ textAlign: 'right' }}>{t.aopThRevenue}</th>}
        <th>{t.goThPaid}</th>
        <th>{t.goThActions}</th>
      </tr>
    </thead>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    // overflow must stay visible (not hidden) or the sticky bulk-action bar below can't
    // stick to the window — an overflow:hidden ancestor traps position:sticky. The inner
    // tables keep their own overflow-x wrappers, so nothing spills horizontally.
    <div className="content-card" style={{ overflow: 'visible' }}>
      {/* Day navigator — All, a single day, or a custom inclusive range */}
      <div className="pickup-daynav-wrap">
        <DateRangeNav
          from={selectedDate}
          to={rangeEnd}
          onChange={(f, to) => { setSelectedDate(f); setRangeEnd(to); }}
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
          <div className="go-search" style={{ flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <input type="text" placeholder={t.goSearchPh} value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" />
            {search && <button onClick={() => setSearch('')} className="go-search-clear" aria-label="Clear search"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>}
          </div>
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
                  <DistrictMultiPicker available={availableDistricts} selected={filterDistricts} onChange={setFilterDistricts}
                    districtGeoMap={districtGeoMap} locDistrict={locDistrict} disabled={availableDistricts.length === 0} />
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
                    {couriers.map(c => <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}, {c.assignedDistrict}</option>)}
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
                      {couriers.map(c => <option key={c.courierId} value={c.courierId}>{c.fullName} — {c.assignedCity}, {c.assignedDistrict}</option>)}
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
        const showFlat = pickupMode === 'grouped' && filterParty === 'recipient' && hasLocationFilter;

        if (showFlat) {
          const flatRows = listOrders.flatMap(go => visibleOrdersFor(go).map(o => ({ o, go })));
          return (
            <div style={{ overflowX: 'auto' }}>
              <table className="go-orders-table">
                {packageHead(true)}
                <tbody>{flatRows.map(({ o, go }) => renderOrderRow(o, go, [], false, true))}</tbody>
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
                                <span className="go-cell__value go-cell__value--mono">{go.senderPhone}</span>
                                {go.alternativeSenderPhone && <span className="go-cell__sub go-cell__value--mono">{go.alternativeSenderPhone}</span>}
                              </div>
                              <div className="go-cell">
                                <span className="go-cell__label">{t.cgoPickupLocation}</span>
                                <span className="go-cell__value">{locCity(go.pickUpCity, go.pickUpCityGeo)}, {locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}</span>
                                {go.pickUpAddress && <span className="go-cell__sub">{go.pickUpAddress}</span>}
                              </div>
                              <div className="go-cell go-cell--center">
                                <span className="go-cell__label">{t.goColStatus}</span>
                                <StatusBadge status={go.status} />
                                {go.isStandalone && <span style={{ marginTop: 3, fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-accent)', background: 'var(--color-accent-dim)', borderRadius: 100, padding: '1px 7px', whiteSpace: 'nowrap' }}>{t.pickupStandaloneBadge}</span>}
                              </div>
                              <div className="go-cell go-cell--center">
                                <span className="go-cell__label">{t.goColPackages}</span>
                                <span className="go-meta__pkgs">{t.goPkgs(go.numberOfPackages)}</span>
                              </div>
                              {go.courierId && (
                                <div className="go-cell go-cell--center">
                                  <span className="go-cell__label">{t.vomLblCourier}</span>
                                  <span className="go-cell__value">{go.courierFullName || '—'}</span>
                                </div>
                              )}
                              <div className="go-cell go-cell--center">
                                <span className="go-cell__label">{t.goColDate}</span>
                                <span className="go-cell__sub go-cell__sub--muted">{formatDate(go.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          {go.isStandalone ? (
                            (canGroup || canManage) && go.customerId && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {canGroup && <button className="go-action-btn go-action-btn--ghost" onClick={e => { e.stopPropagation(); setGroupingDate(new Date(georgianDateKeyOf(go.createdAt) + 'T00:00:00')); setGroupingCustomer({ customerId: go.customerId!, businessName: go.senderBusinessName, ordersPlaced: 1, unattachedOrders: 1 }); }}>{t.pickupGroupOrdersBtn}</button>}
                                {canManage && <button className="go-action-btn go-action-btn--accept" onClick={e => { e.stopPropagation(); const bs = batchesFor(go.customerId!, georgianDateKeyOf(go.createdAt)); setAcceptTargetId(bs[0]?.id ?? ''); setAcceptStandalone(go); }}>{t.goAccept}</button>}
                                {canManage && <button className="go-action-btn go-action-btn--warehouse" onClick={e => { e.stopPropagation(); setWhTargetId(''); setWhCourierId(''); setWhStandalone(go); }}>{t.goForceWarehouse}</button>}
                              </div>
                            )
                          ) : (
                            <AdminGroupOrderActions groupOrder={go} couriers={couriers} token={token ?? ''}
                              onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
                              onRefresh={() => load(searchRef.current)} canManage={canManage} canAssignCourier={canAssignCourier}
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
                                  {packageHead(false, go)}
                                  <tbody>{filteredOrders.map(o => renderOrderRow(o, go, moveDestinations, true))}</tbody>
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
      {actionToast && <div className={`action-toast ${actionToast.type === 'err' ? 'action-toast--err' : ''}`} role="status">{actionToast.msg}</div>}

      {/* Salary / price warnings */}
      {showSalaryWarning && <SalaryWarningModal orderCount={missingSalaryOrders.length} onCancel={() => setShowSalaryWarning(false)} onFillSalaries={() => { setShowSalaryWarning(false); setShowSalaryModal(true); }} />}
      {showPriceWarning && <PriceWarningModal orderCount={missingPriceOrders.length} onCancel={() => setShowPriceWarning(false)} onFillPrices={() => { setShowPriceWarning(false); setShowPriceModal(true); }} />}

      {/* Salary modal */}
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
                <button onClick={() => setShowSalaryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 12, background: 'var(--color-accent-dim)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{salaryChecked.size > 0 ? t.aopApplyToSel(salaryChecked.size) : t.aopApplyToAll}</span>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-2)' }}>
                  <span style={{ padding: '0 6px 0 10px', fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>₾</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" id="bulk-salary-input-pkg2" style={{ flex: 1, minWidth: 0, padding: '6px 8px 6px 2px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: '0.88rem' }} />
                </div>
                <button onClick={() => { const inp = document.getElementById('bulk-salary-input-pkg2') as HTMLInputElement; const val = inp?.value; if (!val) return; const targets = salaryChecked.size > 0 ? [...salaryChecked] : missingSalaryOrders.map(o => o.id); setSalaryDrafts(prev => { const next = { ...prev }; targets.forEach(id => { next[id] = val; }); return next; }); setSalaryChecked(prev => { const next = new Set(prev); targets.forEach(id => next.add(id)); return next; }); inp.value = ''; }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', flexShrink: 0, background: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.aopApplyValue}</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                <input type="checkbox" style={{ cursor: 'pointer' }} checked={allChecked} onChange={e => setSalaryChecked(e.target.checked ? new Set(missingSalaryOrders.map(o => o.id)) : new Set())} />
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopSelectAllN(missingSalaryOrders.length)}</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead><tr style={{ background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ width: 28, padding: '6px 4px' }}></th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThTracking}</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopColAddress}</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSvcPrice}</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSalary}</th>
                    {canSeeRevenue && <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThRevenue}</th>}
                  </tr></thead>
                  <tbody>
                    {missingSalaryOrders.map(o => {
                      const salary = parseFloat(salaryDrafts[o.id] ?? '');
                      const revenue = !isNaN(salary) ? o.companyServicePrice - salary : null;
                      const isChecked = salaryChecked.has(o.id);
                      return (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)', background: isChecked ? 'var(--color-accent-dim)' : 'var(--color-bg-2)' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}><input type="checkbox" style={{ cursor: 'pointer' }} checked={isChecked} onChange={() => setSalaryChecked(prev => { const next = new Set(prev); isChecked ? next.delete(o.id) : next.add(o.id); return next; })} /></td>
                          <td style={{ padding: '6px 8px' }}>
                            <span className="tn-badge">{o.trackingNumber}</span>
                            {o.senderBusinessName && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 3 }}>{o.senderBusinessName}</div>}
                          </td>
                          <td style={{ padding: '6px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{o.recipientCity}, {o.recipientDistrict}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientAddress}</div>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text)' }}>₾{o.companyServicePrice.toFixed(2)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>₾</span>
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={salaryDrafts[o.id] ?? ''} onChange={e => { setSalaryDrafts(prev => ({ ...prev, [o.id]: e.target.value })); if (e.target.value) setSalaryChecked(prev => { const n = new Set(prev); n.add(o.id); return n; }); }} style={{ width: 72, textAlign: 'right', padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.83rem' }} />
                            </div>
                          </td>
                          {canSeeRevenue && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{revenue !== null ? <span style={{ color: revenue >= 0 ? '#10b981' : '#ef4444' }}>₾{revenue.toFixed(2)}</span> : <span style={{ color: 'var(--color-text-subtle)' }}>—</span>}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <button onClick={() => setShowSalaryModal(false)} disabled={salarySaving} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.close}</button>
                <button onClick={handleSalarySave} disabled={salarySaving || salaryChecked.size === 0} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (salarySaving || salaryChecked.size === 0) ? 0.6 : 1 }}>{salarySaving ? t.aopSaving : t.aopSaveWithCount(salaryChecked.size)}</button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Price modal */}
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
                <button onClick={() => setShowPriceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 12, background: 'var(--color-accent-dim)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{priceChecked.size > 0 ? t.aopApplyToSel(priceChecked.size) : t.aopApplyToAll}</span>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-2)' }}>
                  <span style={{ padding: '0 6px 0 10px', fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>₾</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" id="bulk-price-input-pkg2" style={{ flex: 1, minWidth: 0, padding: '6px 8px 6px 2px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: '0.88rem' }} />
                </div>
                <button onClick={() => { const inp = document.getElementById('bulk-price-input-pkg2') as HTMLInputElement; const val = inp?.value; if (!val) return; const targets = priceChecked.size > 0 ? [...priceChecked] : missingPriceOrders.map(o => o.id); setPriceDrafts(prev => { const next = { ...prev }; targets.forEach(id => { next[id] = val; }); return next; }); setPriceChecked(prev => { const next = new Set(prev); targets.forEach(id => next.add(id)); return next; }); inp.value = ''; }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', flexShrink: 0, background: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.aopApplyValue}</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                <input type="checkbox" style={{ cursor: 'pointer' }} checked={allChecked} onChange={e => setPriceChecked(e.target.checked ? new Set(missingPriceOrders.map(o => o.id)) : new Set())} />
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopSelectAllN(missingPriceOrders.length)}</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead><tr style={{ background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ width: 28, padding: '6px 4px' }}></th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThTracking}</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopColAddress}</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSvcPrice}</th>
                  </tr></thead>
                  <tbody>
                    {missingPriceOrders.map(o => {
                      const isChecked = priceChecked.has(o.id);
                      return (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)', background: isChecked ? 'var(--color-accent-dim)' : 'var(--color-bg-2)' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}><input type="checkbox" style={{ cursor: 'pointer' }} checked={isChecked} onChange={() => setPriceChecked(prev => { const next = new Set(prev); isChecked ? next.delete(o.id) : next.add(o.id); return next; })} /></td>
                          <td style={{ padding: '6px 8px' }}><span className="tn-badge">{o.trackingNumber}</span></td>
                          <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{o.recipientCity}, {o.recipientDistrict}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientAddress}</div>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>₾</span>
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={priceDrafts[o.id] ?? ''} onChange={e => { setPriceDrafts(prev => ({ ...prev, [o.id]: e.target.value })); if (e.target.value) setPriceChecked(prev => { const n = new Set(prev); n.add(o.id); return n; }); }} style={{ width: 72, textAlign: 'right', padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.83rem' }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <button onClick={() => setShowPriceModal(false)} disabled={priceSaving} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.close}</button>
                <button onClick={handlePriceSave} disabled={priceSaving || priceChecked.size === 0} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (priceSaving || priceChecked.size === 0) ? 0.6 : 1 }}>{priceSaving ? t.aopSaving : t.aopSaveWithCount(priceChecked.size)}</button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Edit modal (package edit) */}
      <EditOrderModal order={editing?.item ?? null} open={!!editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(searchRef.current); }} token={token ?? ''} couriers={couriers}
        customerPricing={editing?.pricing ?? null} canSeeRevenue={canSeeRevenue} />

      {/* View modal */}
      <ViewOrderModal order={viewingOrder} open={viewingOrder !== null} onClose={() => setViewingOrder(null)} showFinancials={canManage} showRevenue={canSeeRevenue} />

      {/* Grouping modal */}
      {groupingCustomer && (
        <GroupingModal customer={groupingCustomer} date={groupingDate} batches={batchesFor(groupingCustomer.customerId, toDateKey(groupingDate))} token={token ?? ''}
          onClose={() => setGroupingCustomer(null)}
          onGrouped={n => { setGroupingCustomer(null); showToast(t.pickupGroupedToast(n)); void load(searchRef.current); void loadSummary(); }} />
      )}

      {/* Merge modal */}
      {mergingCustomer && (
        <MergeModal customerName={mergingCustomer.name} batches={mergingCustomer.batches} token={token ?? ''}
          onClose={() => setMergingCustomer(null)}
          onMerged={() => { setMergingCustomer(null); showToast(t.pickupMergedToast); void load(searchRef.current); void loadSummary(); }} />
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
                      setAcceptStandalone(null); showToast(t.pickupStandaloneAcceptedToast); void load(searchRef.current); void loadSummary();
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
                      setWhStandalone(null); showToast(t.pickupStandaloneWhToast); void load(searchRef.current); void loadSummary();
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
      `}</style>
    </div>
  );
}

// ── Merge modal (copied from AdminDashboard.tsx) ──────────────────────────────
function MergeModal({ customerName, batches, token, onClose, onMerged }: {
  customerName: string; batches: AdminGroupOrder[]; token: string; onClose: () => void; onMerged: () => void;
}) {
  const { t, lang } = useLanguage();
  const locCity = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);
  const [targetId,  setTargetId]  = useState(batches[0]?.id ?? '');
  const [sourceIds, setSourceIds] = useState<Set<string>>(() => new Set(batches.slice(1).map(b => b.id)));
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseTarget = (id: string) => { setTargetId(id); setSourceIds(prev => { const next = new Set(prev); next.delete(id); return next; }); };
  const toggleSource = (id: string) => { if (id === targetId) return; setSourceIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
  const selectedSources = [...sourceIds].filter(id => id !== targetId);

  const handleMerge = async () => {
    if (!targetId || selectedSources.length === 0) return;
    setBusy(true); setError(null);
    try { await mergeGroupOrders(token, targetId, selectedSources); onMerged(); }
    catch (e) { setError(e instanceof Error ? e.message : t.pickupMergeError); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="pickup-modal__overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="pickup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pickup-modal__header">
          <div>
            <h3 className="pickup-modal__title">{t.pickupMergeBtn} — {customerName}</h3>
            <p className="pickup-modal__subtitle">{t.pickupMergeModalSubtitle}</p>
          </div>
          <button className="pickup-modal__close" onClick={onClose} disabled={busy} aria-label={t.close}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </div>
        <div className="pickup-modal__body">
          <table className="go-orders-table" style={{ minWidth: 0 }}>
            <thead><tr>
              <th style={{ width: 48, textAlign: 'center' }}>{t.pickupMergeKeep}</th>
              <th style={{ width: 60, textAlign: 'center' }}>{t.pickupMergeInto}</th>
              <th>{t.goColPackages}</th><th>{t.goColStatus}</th><th>{t.cgoPickupLocation}</th><th>{t.goColDate}</th>
            </tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={{ textAlign: 'center' }}><input type="radio" name="merge-target-pkg" checked={targetId === b.id} onChange={() => chooseTarget(b.id)} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" disabled={targetId === b.id} checked={targetId !== b.id && sourceIds.has(b.id)} onChange={() => toggleSource(b.id)} /></td>
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
          <button className="go-action-btn go-action-btn--city" onClick={handleMerge} disabled={busy || selectedSources.length === 0}>{busy ? t.pickupMerging : t.pickupMergeBtn}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Move-order control (copied) ───────────────────────────────────────────────
function MoveOrderControl({ orderId, destinations, token, onMoved, onError }: {
  orderId: string; destinations: AdminGroupOrder[]; token: string; onMoved: () => void; onError: (msg: string) => void;
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
    <select className="go-select go-select--inline" style={{ minWidth: 120 }} value="" disabled={busy} onChange={e => void handle(e.target.value)} title={t.pickupMoveTo}>
      <option value="">{busy ? t.pickupMoving : t.pickupMoveTo}</option>
      {destinations.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {b.numberOfPackages}</option>)}
    </select>
  );
}

// ── Grouping modal (copied) ───────────────────────────────────────────────────
function GroupingModal({ customer, date, batches, token, onClose, onGrouped }: {
  customer: PickupDayCustomer; date: Date; batches: AdminGroupOrder[]; token: string; onClose: () => void; onGrouped: (count: number) => void;
}) {
  const { t, lang } = useLanguage();
  const locCity = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);
  const [orders, setOrders]     = useState<AdminOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
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

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(orders.map(o => o.id)));

  const handleGroup = async () => {
    if (selected.size === 0) return;
    setBusy(true); setError(null);
    try { await attachOrdersToGroup(token, customer.customerId, toDateKey(date), [...selected], targetBatchId || undefined); onGrouped(selected.size); }
    catch (e) { setError(e instanceof Error ? e.message : t.pickupGroupError); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="pickup-modal__overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="pickup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pickup-modal__header">
          <div>
            <h3 className="pickup-modal__title">{t.pickupModalTitle(customer.businessName)}</h3>
            <p className="pickup-modal__subtitle">{t.pickupModalSubtitle}</p>
          </div>
          <button className="pickup-modal__close" onClick={onClose} disabled={busy} aria-label={t.close}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
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
                    {batches.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}</option>)}
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
                <thead><tr><th style={{ width: 34 }} /><th>{t.goThTracking}</th><th>{t.goThRecipient}</th><th>{t.goThCityDistrict}</th><th>{t.goThCollect}</th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => toggle(o.id)}>
                      <td><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} onClick={e => e.stopPropagation()} /></td>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</td>
                      <td>{locCity(o.recipientCity, o.recipientCityGeo)}, {o.recipientDistrict}</td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{o.amountToCollectForPackage != null ? `₾${o.amountToCollectForPackage.toFixed(2)}` : '—'}</td>
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
          <button className="go-action-btn go-action-btn--assign" onClick={handleGroup} disabled={busy || selected.size === 0}>{busy ? t.pickupModalGrouping : t.pickupModalGroup}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
