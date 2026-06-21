import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder, AdminOrder, OrderStatus } from '../../api/adminGroupOrders';
import { fetchReturnExchangeOrders } from '../../api/returnExchange';
import type { ReturnExchangeOrder } from '../../api/returnExchange';
import { getStatusMeta } from '../../utils/statusMeta';
import { georgianToday, toDateKey, georgianDateKeyOf } from '../../utils/georgianTime';

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

type HistoryFilter = 'delivered' | 'cancelled' | 'returned' | 'exchanged';

const HISTORY_PILLS: { value: HistoryFilter; labelKey: string }[] = [
  { value: 'delivered', labelKey: 'histPillDelivered' },
  { value: 'cancelled', labelKey: 'histPillCancelled' },
  { value: 'returned',  labelKey: 'histPillReturned' },
  { value: 'exchanged', labelKey: 'histPillExchanged' },
];

const CANCELLED_STATUSES = new Set<string>(['CancelledBySender', 'CancelledByAdmin', 'OrderNotAccepted']);

// Which history category a single order belongs to — or null when it is not yet
// terminal (still in progress, so it has no place in History). Mirrors the prior
// group-level logic but applied per order so the list is flat single orders.
function orderCategory(o: AdminOrder): HistoryFilter | null {
  if (o.status === 'DeliveredToRecipient' && o.orderType !== 'Exchange') return 'delivered';
  if (o.status === 'ExchangeCompleted') return 'exchanged';
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
    customerId: null,
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
    }],
  };
}

// A single order flattened out of its (real or wrapped) group order, carrying the
// parent's sender info for display.
interface FlatHistoryOrder {
  order: AdminOrder;
  senderBusinessName: string;
  senderName: string;
  category: HistoryFilter;
  completedAt: string;
}

// Group orders are searched server-side; the standalone (wrapped) returns are not,
// so match them here on sender + their single package.
function returnMatchesSearch(go: AdminGroupOrder, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (go.senderBusinessName.toLowerCase().includes(q)) return true;
  if (go.senderPhone.toLowerCase().includes(q)) return true;
  if (go.pickUpCity.toLowerCase().includes(q)) return true;
  return go.orders.some(o =>
    o.recipientName.toLowerCase().includes(q) ||
    o.recipientPhone.toLowerCase().includes(q) ||
    o.recipientCity.toLowerCase().includes(q) ||
    o.trackingNumber.toLowerCase().includes(q));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminHistoryPage({ token }: { token: string }) {
  const { t, lang } = useLanguage();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;

  const [groupOrders,   setGroupOrders]  = useState<AdminGroupOrder[]>([]);
  const [returnOrders,  setReturnOrders] = useState<AdminGroupOrder[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState<string | null>(null);
  const [search,        setSearch]       = useState('');
  const [filterStatus,  setFilterStatus] = useState<HistoryFilter>('delivered');
  // Day navigator — filters by completion date (delivery date, or created date when
  // cancelled). Defaults to today, mirrors the Pick-Up / Delivery day selectors.
  const [selectedDate,  setSelectedDate] = useState<Date>(() => georgianToday());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (term: string) => {
    try {
      const data = await fetchGroupOrders(token, term || undefined);
      setGroupOrders(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void (async () => { setLoading(true); await load(''); })();
  }, [load]);

  // Standalone Return orders are not part of any GroupOrder, so fetch them
  // separately and keep the terminal ones (returned to sender / cancelled).
  useEffect(() => {
    fetchReturnExchangeOrders(token)
      .then(orders => setReturnOrders(
        orders
          .filter(o => o.orderType === 'Return'
            && (o.status === 'ReturnedToSender' || o.status === 'CancelledByAdmin'))
          .map(wrapReturnAsGroupOrder)
      ))
      .catch(() => setReturnOrders([]));
  }, [token]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => { setLoading(true); await load(search); })();
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, load]);

  // ── Day navigator ─────────────────────────────────────────────────────────
  const shiftDay = (delta: number) => setSelectedDate(prev => {
    const d = new Date(prev); d.setDate(d.getDate() + delta); d.setHours(0, 0, 0, 0); return d;
  });
  const isToday = toDateKey(selectedDate) === toDateKey(georgianToday());
  const dayKey  = toDateKey(selectedDate);

  // Flatten every terminal order out of its group/wrapped return. Group orders are
  // already search-filtered server-side; the wrapped returns are filtered here.
  const flatOrders = useMemo<FlatHistoryOrder[]>(() => {
    const result: FlatHistoryOrder[] = [];
    const all = [...groupOrders, ...returnOrders.filter(go => returnMatchesSearch(go, search))];
    for (const go of all) {
      for (const o of go.orders) {
        const category = orderCategory(o);
        if (!category) continue;
        result.push({
          order: o,
          senderBusinessName: go.senderBusinessName,
          senderName: `${go.senderFirstName} ${go.senderLastName}`.trim(),
          category,
          completedAt: completionDateOf(o),
        });
      }
    }
    return result;
  }, [groupOrders, returnOrders, search]);

  // Narrow to the selected completion day.
  const dayOrders = useMemo(
    () => flatOrders.filter(f => georgianDateKeyOf(f.completedAt) === dayKey),
    [flatOrders, dayKey],
  );

  const counts = useMemo(() => ({
    delivered: dayOrders.filter(f => f.category === 'delivered').length,
    cancelled: dayOrders.filter(f => f.category === 'cancelled').length,
    returned:  dayOrders.filter(f => f.category === 'returned').length,
    exchanged: dayOrders.filter(f => f.category === 'exchanged').length,
  }), [dayOrders]);

  const visible = useMemo(
    () => dayOrders
      .filter(f => f.category === filterStatus)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [dayOrders, filterStatus],
  );

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
        .hist-table { width: 100%; border-collapse: collapse; table-layout: auto; }
        .hist-table th { text-align: left; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-subtle); padding: 8px 10px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); white-space: nowrap; position: sticky; top: 0; z-index: 1; }
        .hist-table td { padding: 8px 10px; font-size: 0.8rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); vertical-align: middle; white-space: nowrap; }
        .hist-table tbody tr:last-child td { border-bottom: none; }
        .hist-table tbody tr:hover { background: rgba(255,255,255,0.02); }
        .hist-table th.num, .hist-table td.num { text-align: right; }
        .hist-table .hist-totals td { background: var(--color-bg-3); border-top: 2px solid var(--color-border); border-bottom: none; font-weight: 700; font-size: 0.74rem; }
        .hist-table .hist-totals td:first-child { font-size: 0.66rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-subtle); }
      `}</style>

      {/* Day navigator — filters by completion (delivery) date */}
      <div className="hist-daynav">
        <button className="hist-daynav__arrow" onClick={() => shiftDay(-1)} aria-label={t.pickupPrevDay} title={t.pickupPrevDay}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="hist-daynav__label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>{selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {isToday && <span className="hist-daynav__today">{t.pickupToday}</span>}
        </div>
        <button className="hist-daynav__arrow" onClick={() => shiftDay(1)} aria-label={t.pickupNextDay} title={t.pickupNextDay}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {!isToday && (
          <button className="hist-daynav__jump" onClick={() => setSelectedDate(georgianToday())}>
            {t.pickupToday}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="go-toolbar go-toolbar--search" style={{ gap: 10, alignItems: 'center' }}>
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
        {!loading && !error && (
          <span className="go-count" style={{ marginLeft: 'auto' }}>
            {visible.length} {t.goOrdersMatched}
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
      {!loading && !error && visible.length === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{t.goHistoryNoMatch}</span>
        </div>
      )}

      {/* Flat single-order table */}
      {!loading && !error && visible.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
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
                <th className="num" title="Company revenue">Revenue ₾</th>
                <th className="num" title="Created date">Created</th>
                <th className="num" title="Completion (delivery) date">Completed</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(f => {
                const o = f.order;
                return (
                  <tr key={o.id}>
                    <td><span className="tn-badge">{o.trackingNumber}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.senderBusinessName || '—'}</div>
                      {f.senderName && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{f.senderName}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div>
                      <div style={{ fontFamily: 'Courier New, monospace', fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                        {o.recipientPhone}
                      </div>
                    </td>
                    <td>
                      <div>{locCity(o.recipientCity, o.recipientCityGeo)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                        {locDistrict(o.recipientDistrict, o.recipientDistrictGeo)}
                      </div>
                    </td>
                    <td><StatusBadge status={o.status} /></td>
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
                    <td className="num" style={{
                      fontWeight: 600,
                      color: o.companyRevenue != null ? (o.companyRevenue >= 0 ? '#10b981' : '#ef4444') : undefined,
                    }}>
                      {money(o.companyRevenue)}
                    </td>
                    <td className="num" style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="num" style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {o.deliveredAt ? formatDate(o.deliveredAt) : <span style={{ opacity: 0.35 }}>—</span>}
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
                  <td className="num" style={{ color: totals.revenue >= 0 ? '#10b981' : '#ef4444' }}>₾{totals.revenue.toFixed(2)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
