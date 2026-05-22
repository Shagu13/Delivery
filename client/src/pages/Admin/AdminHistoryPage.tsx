import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
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

// ── Completed logic (exported for use in AdminDashboard) ──────────────────────

const TERMINAL_GO_STATUSES = new Set([
  'CancelledBySender',
  'CancelledByAdmin',
  'OrderNotAccepted',
  'AllDelivered',
]);

const TERMINAL_ORDER_STATUSES = new Set([
  'DeliveredToRecipient',
  'CancelledByAdmin',
]);

export function isCompletedGroupOrder(go: AdminGroupOrder): boolean {
  if (TERMINAL_GO_STATUSES.has(go.status)) return true;
  if (go.orders.length > 0 && go.orders.every(o => TERMINAL_ORDER_STATUSES.has(o.status))) return true;
  return false;
}

// ── History status pills ──────────────────────────────────────────────────────

type HistoryFilter = '' | 'AllDelivered' | 'CancelledBySender' | 'CancelledByAdmin' | 'OrderNotAccepted';

const HISTORY_PILLS: { value: HistoryFilter; labelKey: string }[] = [
  { value: '',                  labelKey: 'pillAll' },
  { value: 'AllDelivered',      labelKey: 'pillAllDelivered' },
  { value: 'CancelledBySender', labelKey: 'pillCancelledSender' },
  { value: 'CancelledByAdmin',  labelKey: 'pillCancelledAdmin' },
  { value: 'OrderNotAccepted',  labelKey: 'pillDeclined' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminHistoryPage({ token }: { token: string }) {
  const { t, lang } = useLanguage();
  const locCity     = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const locDistrict = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;

  const [groupOrders,   setGroupOrders]  = useState<AdminGroupOrder[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState<string | null>(null);
  const [search,        setSearch]       = useState('');
  const [filterStatus,  setFilterStatus] = useState<HistoryFilter>('');
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const completedOrders = useMemo(
    () => groupOrders.filter(isCompletedGroupOrder),
    [groupOrders],
  );

  const visibleOrders = useMemo(() => {
    if (!filterStatus) return completedOrders;
    if (filterStatus === 'AllDelivered') {
      return completedOrders.filter(go =>
        go.status === 'AllDelivered' ||
        (go.orders.length > 0 && go.orders.every(o => o.status === 'DeliveredToRecipient'))
      );
    }
    return completedOrders.filter(go => go.status === filterStatus);
  }, [completedOrders, filterStatus]);

  const hasFilters = !!(search || filterStatus);

  const counts = useMemo(() => ({
    all:               completedOrders.length,
    AllDelivered:      completedOrders.filter(go =>
      go.status === 'AllDelivered' ||
      (go.orders.length > 0 && go.orders.every(o => o.status === 'DeliveredToRecipient'))
    ).length,
    CancelledBySender: completedOrders.filter(go => go.status === 'CancelledBySender').length,
    CancelledByAdmin:  completedOrders.filter(go => go.status === 'CancelledByAdmin').length,
    OrderNotAccepted:  completedOrders.filter(go => go.status === 'OrderNotAccepted').length,
  }), [completedOrders]);

  const pillCount = (v: HistoryFilter) =>
    v === '' ? counts.all : counts[v as keyof typeof counts] ?? 0;

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>

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

            // Aggregate financials for the group header summary
            const totalSvc      = go.orders.reduce((s, o) => s + (o.companyServicePrice ?? 0), 0);
            const totalRevenue  = go.orders.reduce((s, o) => s + (o.companyRevenue ?? 0), 0);
            const totalCod      = go.orders.reduce((s, o) => s + (o.amountToCollectForPackage ?? 0), 0);
            const totalCash     = go.orders.reduce((s, o) => s + (o.amountOfCashCollected ?? 0), 0);

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
                    <span className="go-meta__city">
                      {locCity(go.pickUpCity, go.pickUpCityGeo)}, {locDistrict(go.pickUpDistrict, go.pickUpDistrictGeo)}
                    </span>
                    <StatusBadge status={go.status} />
                    <span className="go-meta__pkgs">{t.goPkgs(go.numberOfPackages)}</span>
                    <span className="go-meta__date">{formatDate(go.createdAt)}</span>
                  </div>

                  {/* Financial summary chips */}
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
                    {go.orders.length === 0 ? (
                      <div style={{ padding: '16px 20px', fontSize: '0.825rem', color: 'var(--color-text-subtle)' }}>
                        No packages in this order.
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
                              <th title="Fragile">🔸</th>
                              <th title="Who pays service fee">Payer</th>
                              <th title="Product payment status">{t.goThPaid}</th>
                              <th title="COD — cash to collect from recipient for product">COD ₾</th>
                              <th title="Cash actually collected by courier">Collected ₾</th>
                              <th title="Company service price">Svc ₾</th>
                              <th title="Courier salary">Salary ₾</th>
                              <th title="Company revenue">Revenue ₾</th>
                              <th title="Delivered date">Delivered</th>
                            </tr>
                          </thead>
                          <tbody>
                            {go.orders.map(o => (
                              <tr key={o.id}>
                                <td><span className="tn-badge">{o.trackingNumber}</span></td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{o.recipientFirstName} {o.recipientLastName}</div>
                                </td>
                                <td style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>
                                  {o.recipientPhone}
                                </td>
                                <td>
                                  <div>{locCity(o.recipientCity, o.recipientCityGeo)}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                                    {locDistrict(o.recipientDistrict, o.recipientDistrictGeo)}
                                  </div>
                                </td>
                                <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 160 }}>
                                  {o.recipientAddress}
                                </td>
                                <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 140 }}>
                                  {o.description ?? <span style={{ opacity: 0.35 }}>—</span>}
                                </td>
                                <td><StatusBadge status={o.status} /></td>

                                {/* Fragile */}
                                <td style={{ textAlign: 'center' }}>
                                  {o.isFragile
                                    ? <span title="Fragile" style={{ fontSize: '0.78rem', color: '#f97316' }}>🔸</span>
                                    : <span style={{ opacity: 0.25, fontSize: '0.78rem' }}>—</span>}
                                </td>

                                {/* Who pays service fee */}
                                <td>
                                  <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '2px 7px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: o.whoPaysForCompanyService === 'Sender'
                                      ? 'var(--color-bg-3)' : 'var(--color-accent-dim)',
                                    color: o.whoPaysForCompanyService === 'Sender'
                                      ? 'var(--color-text-subtle)' : 'var(--color-accent)',
                                  }}>
                                    {o.whoPaysForCompanyService === 'Sender' ? 'Sndr' : 'Rcpt'}
                                  </span>
                                </td>

                                {/* Product paid */}
                                <td>
                                  <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: o.productPaymentStatus === 'Paid' ? '#10b981' : '#ef4444',
                                  }}>
                                    {o.productPaymentStatus === 'Paid' ? t.goPaid : t.goUnpaid}
                                  </span>
                                </td>

                                {/* COD — amount to collect */}
                                <td style={{ fontWeight: 600, color: '#d97706' }}>
                                  {o.amountToCollectForPackage != null && o.amountToCollectForPackage > 0
                                    ? `₾${o.amountToCollectForPackage.toFixed(2)}`
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>

                                {/* Cash actually collected */}
                                <td style={{ fontWeight: 600, color: '#16a34a' }}>
                                  {o.amountOfCashCollected != null && o.amountOfCashCollected > 0
                                    ? `₾${o.amountOfCashCollected.toFixed(2)}`
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>

                                {/* Service price */}
                                <td style={{ fontWeight: 600 }}>
                                  {money(o.companyServicePrice)}
                                </td>

                                {/* Courier salary */}
                                <td style={{ color: '#f97316', fontWeight: 600 }}>
                                  {money(o.courierSalary)}
                                </td>

                                {/* Revenue */}
                                <td style={{
                                  fontWeight: 600,
                                  color: o.companyRevenue != null
                                    ? (o.companyRevenue >= 0 ? '#10b981' : '#ef4444')
                                    : undefined,
                                }}>
                                  {money(o.companyRevenue)}
                                </td>

                                {/* Delivered at */}
                                <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                                  {o.deliveredAt
                                    ? new Date(o.deliveredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>

                          {/* Totals footer row */}
                          {go.orders.length > 1 && (
                            <tfoot>
                              <tr style={{ background: 'var(--color-bg-3)', borderTop: '2px solid var(--color-border)' }}>
                                <td colSpan={12} style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>
                                  Totals
                                </td>
                                <td style={{ fontWeight: 700, padding: '8px 12px' }}>
                                  ₾{go.orders.reduce((s, o) => s + (o.companyServicePrice ?? 0), 0).toFixed(2)}
                                </td>
                                <td style={{ fontWeight: 700, color: '#f97316', padding: '8px 12px' }}>
                                  {go.orders.some(o => o.courierSalary != null)
                                    ? `₾${go.orders.reduce((s, o) => s + (o.courierSalary ?? 0), 0).toFixed(2)}`
                                    : <span style={{ opacity: 0.35 }}>—</span>}
                                </td>
                                <td style={{ fontWeight: 700, padding: '8px 12px', color: totalRevenue >= 0 ? '#10b981' : '#ef4444' }}>
                                  {go.orders.some(o => o.companyRevenue != null)
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
