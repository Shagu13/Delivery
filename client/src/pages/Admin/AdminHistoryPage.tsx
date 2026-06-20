import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder, OrderStatus } from '../../api/adminGroupOrders';
import { fetchReturnExchangeOrders } from '../../api/returnExchange';
import type { ReturnExchangeOrder } from '../../api/returnExchange';
import { getStatusMeta } from '../../utils/statusMeta';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
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
    status === 'DeliveredToRecipient' || status === 'AllDelivered'
      ? 'status-badge status-badge--delivered'
      : status.startsWith('Cancelled') || status === 'OrderNotAccepted'
        ? 'status-badge status-badge--cancelled'
        : 'status-badge status-badge--neutral';
  return <span className={cls} title={meta.description}>{meta.short}</span>;
}

// ── History status pills ──────────────────────────────────────────────────────

type HistoryFilter = 'delivered' | 'cancelled' | 'returned' | 'exchanged';

const HISTORY_PILLS: { value: HistoryFilter; labelKey: string }[] = [
  { value: 'delivered', labelKey: 'histPillDelivered' },
  { value: 'cancelled', labelKey: 'histPillCancelled' },
  { value: 'returned',  labelKey: 'histPillReturned' },
  { value: 'exchanged', labelKey: 'histPillExchanged' },
];

const CANCELLED_STATUSES = new Set<string>(['CancelledBySender', 'CancelledByAdmin', 'OrderNotAccepted']);

// Which history category does a (real or wrapped) group order belong to?
// A group order can match more than one category when it mixes order types.
// Status-driven (not orderType-driven) so delivered orders always surface even
// if orderType is missing or the group still holds other in-progress packages.
function matchesHistoryFilter(go: AdminGroupOrder, filter: HistoryFilter): boolean {
  switch (filter) {
    case 'cancelled':
      return CANCELLED_STATUSES.has(go.status) || go.orders.some(o => CANCELLED_STATUSES.has(o.status));
    case 'returned':
      return go.orders.some(o => o.status === 'ReturnedToSender');
    case 'exchanged':
      return go.orders.some(o => o.status === 'ExchangeCompleted');
    case 'delivered':
      return go.status === 'AllDelivered' ||
        go.orders.some(o => o.status === 'DeliveredToRecipient' && o.orderType !== 'Exchange');
  }
}

// The individual packages within a group that belong to the active category.
// Prevents the expanded view from showing unrelated, non-terminal siblings.
function ordersForFilter(go: AdminGroupOrder, filter: HistoryFilter): AdminGroupOrder['orders'] {
  switch (filter) {
    case 'cancelled':
      // A group cancelled/declined as a whole may still hold non-terminal packages — show them all.
      return CANCELLED_STATUSES.has(go.status)
        ? go.orders
        : go.orders.filter(o => CANCELLED_STATUSES.has(o.status));
    case 'returned':
      return go.orders.filter(o => o.status === 'ReturnedToSender');
    case 'exchanged':
      return go.orders.filter(o => o.status === 'ExchangeCompleted');
    case 'delivered':
      return go.orders.filter(o => o.status === 'DeliveredToRecipient' && o.orderType !== 'Exchange');
  }
}

// Standalone Return orders live outside any GroupOrder, so wrap each one as a
// single-package pseudo group order to reuse the existing accordion rendering.
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

// Client-side search for wrapped returns (group orders are searched server-side).
function groupOrderMatchesSearch(go: AdminGroupOrder, term: string): boolean {
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
  const [expandedIds,   setExpandedIds]  = useState<Set<string>>(new Set());
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

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Group orders are searched server-side; wrapped returns are searched here.
  // A group order belongs in History if it contains at least one order that
  // falls into one of the four history categories (delivered/cancelled/returned/exchanged).
  const completedOrders = useMemo(() => {
    const merged = [
      ...groupOrders,
      ...returnOrders.filter(go => groupOrderMatchesSearch(go, search)),
    ];
    return merged
      .filter(go => HISTORY_PILLS.some(p => matchesHistoryFilter(go, p.value)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [groupOrders, returnOrders, search]);

  const visibleOrders = useMemo(
    () => completedOrders.filter(go => matchesHistoryFilter(go, filterStatus)),
    [completedOrders, filterStatus],
  );

  const hasFilters = true;

  const counts = useMemo(() => ({
    delivered: completedOrders.filter(go => matchesHistoryFilter(go, 'delivered')).length,
    cancelled: completedOrders.filter(go => matchesHistoryFilter(go, 'cancelled')).length,
    returned:  completedOrders.filter(go => matchesHistoryFilter(go, 'returned')).length,
    exchanged: completedOrders.filter(go => matchesHistoryFilter(go, 'exchanged')).length,
  }), [completedOrders]);

  const pillCount = (v: HistoryFilter) => counts[v];

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>
      <style>{`
        .hist-table { width: 100%; border-collapse: collapse; table-layout: auto; }
        .hist-table th { text-align: left; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-subtle); padding: 8px 10px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); white-space: nowrap; }
        .hist-table td { padding: 8px 10px; font-size: 0.8rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); vertical-align: middle; white-space: nowrap; }
        .hist-table tbody tr:last-child td { border-bottom: none; }
        .hist-table tbody tr:hover { background: rgba(255,255,255,0.02); }
        .hist-table th.num, .hist-table td.num { text-align: right; }
        .hist-table .hist-totals td { background: var(--color-bg-3); border-top: 2px solid var(--color-border); border-bottom: none; font-weight: 700; font-size: 0.74rem; }
        .hist-table .hist-totals td:first-child { font-size: 0.66rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-subtle); }
      `}</style>

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
            {visibleOrders.length}{visibleOrders.length !== completedOrders.length ? `/${completedOrders.length}` : ''} completed
            {hasFilters ? ` ${t.goOrdersMatched}` : ''}
          </span>
        )}
      </div>

      {/* Status pills */}
      <div className="go-toolbar go-status-bar">
        <span className="go-filter-label">{t.goStatus}</span>
        {HISTORY_PILLS.map(({ value, labelKey }) => {
          const cnt = pillCount(value);
          return (
            <button
              key={value || 'all'}
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
      {!loading && !error && visibleOrders.length === 0 && (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">
            {hasFilters ? t.goHistoryNoMatch : t.goHistoryNoOrders}
          </span>
        </div>
      )}

      {/* Group order accordion list */}
      {!loading && !error && visibleOrders.length > 0 && (
        <div className="go-list">
          {visibleOrders.map(go => {
            const expanded = expandedIds.has(go.id);

            // Only the packages that belong to the active history category.
            const rows = ordersForFilter(go, filterStatus);
            const totalSvc      = rows.reduce((s, o) => s + (o.companyServicePrice ?? 0), 0);
            const totalRevenue  = rows.reduce((s, o) => s + (o.companyRevenue ?? 0), 0);
            const totalCod      = rows.reduce((s, o) => s + (o.amountToCollectForPackage ?? 0), 0);
            const totalCash     = rows.reduce((s, o) => s + (o.amountOfCashCollected ?? 0), 0);

            return (
              <div className="go-row" key={go.id}>
                {/* ── Group header ── */}
                <div className="go-row-header" onClick={() => toggleExpand(go.id)}>
                  <svg
                    className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`}
                    width="14" height="14" viewBox="0 0 16 16" fill="none"
                  >
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>

                  <div className="go-sender">
                    <div className="go-sender__biz">{go.senderBusinessName}</div>
                    <div className="go-sender__name">{go.senderFirstName} {go.senderLastName}</div>
                  </div>

                  <div className="go-meta">
                    <span className="go-meta__phone">{go.senderPhone}</span>
                    {go.alternativeSenderPhone && (
                      <span className="go-meta__phone">{go.alternativeSenderPhone}</span>
                    )}
                    <span className="go-meta__city">
                      {locCity(go.pickUpCity, go.pickUpCityGeo)}, {locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}
                    </span>
                    <StatusBadge status={go.status} />
                    <span className="go-meta__pkgs">{t.goPkgs(rows.length)}</span>
                    <span className="go-meta__date">{formatDate(go.createdAt)}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0, flexWrap: 'wrap' }}>
                    {totalSvc > 0 && (
                      <span style={chipStyle('var(--color-bg-3)', 'var(--color-text-subtle)')}>
                        Svc ₾{totalSvc.toFixed(2)}
                      </span>
                    )}
                    {totalRevenue !== 0 && (
                      <span style={chipStyle(totalRevenue >= 0 ? '#dcfce7' : '#fee2e2', totalRevenue >= 0 ? '#15803d' : '#dc2626')}>
                        Rev ₾{totalRevenue.toFixed(2)}
                      </span>
                    )}
                    {totalCod > 0 && (
                      <span style={chipStyle('#fef9c3', '#854d0e')}>
                        COD ₾{totalCod.toFixed(2)}
                      </span>
                    )}
                    {totalCash > 0 && (
                      <span style={chipStyle('#f0fdf4', '#166534')}>
                        Cash ₾{totalCash.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Expanded orders table ── */}
                {expanded && (
                  <div className="go-orders">
                    {rows.length === 0 ? (
                      <div style={{ padding: '16px 20px', fontSize: '0.825rem', color: 'var(--color-text-subtle)' }}>
                        No packages in this order.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="hist-table">
                          <thead>
                            <tr>
                              <th>{t.goThTracking}</th>
                              <th>{t.goThRecipient}</th>
                              <th>{t.goThCityDistrict}</th>
                              <th>{t.goThStatus}</th>
                              <th title="Product payment status">{t.goThPaid}</th>
                              <th className="num" title="COD — cash to collect from recipient for product">COD ₾</th>
                              <th className="num" title="Cash actually collected by courier">Collected ₾</th>
                              <th className="num" title="Company service price">Svc ₾</th>
                              <th className="num" title="Courier salary">Salary ₾</th>
                              <th className="num" title="Company revenue">Revenue ₾</th>
                              <th className="num" title="Delivered date">Delivered</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(o => (
                              <tr key={o.id}>
                                <td><span className="tn-badge">{o.trackingNumber}</span></td>
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

                                <td className="num" style={{ fontWeight: 600 }}>
                                  {money(o.companyServicePrice)}
                                </td>

                                <td className="num" style={{ color: '#f97316', fontWeight: 600 }}>
                                  {money(o.courierSalary)}
                                </td>

                                <td className="num" style={{
                                  fontWeight: 600,
                                  color: o.companyRevenue != null
                                    ? (o.companyRevenue >= 0 ? '#10b981' : '#ef4444')
                                    : undefined,
                                }}>
                                  {money(o.companyRevenue)}
                                </td>

                                <td className="num" style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                                  {o.deliveredAt
                                    ? new Date(o.deliveredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>

                          {rows.length > 1 && (
                            <tfoot>
                              <tr className="hist-totals">
                                <td colSpan={5}>Totals</td>
                                <td className="num">{totalCod > 0 ? `₾${totalCod.toFixed(2)}` : <span style={{ opacity: 0.35 }}>—</span>}</td>
                                <td className="num">{totalCash > 0 ? `₾${totalCash.toFixed(2)}` : <span style={{ opacity: 0.35 }}>—</span>}</td>
                                <td className="num">₾{totalSvc.toFixed(2)}</td>
                                <td className="num" style={{ color: '#f97316' }}>
                                  {rows.some(o => o.courierSalary != null)
                                    ? `₾${rows.reduce((s, o) => s + (o.courierSalary ?? 0), 0).toFixed(2)}`
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>
                                <td className="num" style={{ color: totalRevenue >= 0 ? '#10b981' : '#ef4444' }}>
                                  {rows.some(o => o.companyRevenue != null)
                                    ? `₾${totalRevenue.toFixed(2)}`
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                    {go.note && (
                      <div className="go-note">
                        <strong>{t.goNote}:</strong> {go.note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function chipStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: '0.68rem',
    fontWeight: 700,
    background: bg,
    color,
    borderRadius: 'var(--radius-sm)',
    padding: '2px 7px',
    whiteSpace: 'nowrap' as const,
  };
}
