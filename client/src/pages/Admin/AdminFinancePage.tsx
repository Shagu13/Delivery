import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAdminFinanceSummary,
  getUnpaidFeeOrders,
  type AdminFinancePage,
  type AdminFinanceSummary,
  type FinanceLedgerEntry,
  type LedgerTypeFilter,
  type UnpaidFeeOrder,
} from '../../api/finance';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtInt = (n: number) => n.toLocaleString('ka-GE');

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', {
    month: 'short', year: 'numeric',
  });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ka-GE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--color-bg-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
          background: accent ? `${accent}18` : 'var(--color-bg-3)',
          color: accent ?? 'var(--color-text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.45rem', fontWeight: 700, color: accent ?? 'var(--color-text)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{sub}</div>
      )}
    </div>
  );
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────

function BarChart({ summaries }: { summaries: AdminFinanceSummary[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxRevenue = Math.max(...summaries.map(s => s.grossServiceRevenue), 1);

  return (
    <div style={{
      background: 'var(--color-bg-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '20px 20px 16px',
      gridColumn: '1 / -1',
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)', marginBottom: 16 }}>
        Monthly Revenue vs Net Income
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
        {summaries.map((s, i) => {
          const grossH = Math.round((s.grossServiceRevenue / maxRevenue) * 100);
          const netH   = Math.round((Math.max(s.netServiceIncome, 0) / maxRevenue) * 100);
          const isHov  = hovered === i;
          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHov && (
                <div style={{
                  position: 'absolute',
                  background: 'var(--color-bg-3)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  fontSize: '0.72rem',
                  color: 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  pointerEvents: 'none',
                  transform: 'translateY(-110%)',
                }}>
                  <div><strong>{monthLabel(s.year, s.month)}</strong></div>
                  <div>Revenue: ₾{fmt(s.grossServiceRevenue)}</div>
                  <div>Net: ₾{fmt(s.netServiceIncome)}</div>
                  <div>Orders: {fmtInt(s.totalOrdersDelivered)}</div>
                </div>
              )}
              <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'flex-end', gap: 2, position: 'relative' }}>
                <div style={{
                  flex: 1, height: `${grossH}%`, minHeight: 2,
                  background: isHov ? 'var(--color-accent)' : 'var(--color-accent-dim)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'background 0.15s, height 0.3s',
                  border: '1px solid rgba(196,127,23,0.3)',
                }} />
                <div style={{
                  flex: 1, height: `${netH}%`, minHeight: 2,
                  background: isHov ? '#10b981' : 'rgba(16,185,129,0.25)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'background 0.15s, height 0.3s',
                  border: '1px solid rgba(16,185,129,0.3)',
                }} />
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                {new Date(s.year, s.month - 1).toLocaleDateString('en-GB', { month: 'short' })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
          <div style={{ width: 10, height: 10, background: 'var(--color-accent-dim)', border: '1px solid rgba(196,127,23,0.4)', borderRadius: 2 }} />
          Gross Revenue
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
          <div style={{ width: 10, height: 10, background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 2 }} />
          Net Income
        </div>
      </div>
    </div>
  );
}

// ── Monthly summary row ────────────────────────────────────────────────────────

function MonthlySummaryTable({ summaries }: { summaries: AdminFinanceSummary[] }) {
  const sorted = [...summaries].reverse(); // newest first
  return (
    <div style={{
      background: 'var(--color-bg-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      gridColumn: '1 / -1',
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
        fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)',
      }}>
        Monthly Breakdown
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-3)' }}>
              {['Month', 'Orders', 'Gross Revenue', 'Courier Salaries', 'Net Income',
                'COD Collected', 'COD Owed', 'Received from Senders'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', textAlign: h === 'Month' || h === 'Orders' ? 'left' : 'right',
                  color: 'var(--color-text-muted)', fontWeight: 600,
                  borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                  {monthLabel(s.year, s.month)}
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--color-text-muted)' }}>
                  {fmtInt(s.totalOrdersDelivered)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--color-accent)' }}>
                  ₾{fmt(s.grossServiceRevenue)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', color: '#ef4444' }}>
                  ₾{fmt(s.totalCourierSalaries)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700,
                  color: s.netServiceIncome >= 0 ? '#10b981' : '#ef4444' }}>
                  ₾{fmt(s.netServiceIncome)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                  ₾{fmt(s.totalCodCollected)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right',
                  color: s.totalCodOwedToSenders > 0 ? '#b45309' : 'var(--color-text-subtle)' }}>
                  ₾{fmt(s.totalCodOwedToSenders)}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', color: '#10b981' }}>
                  ₾{fmt(s.totalReceivedFromSenders)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ledger type label ─────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  SenderPaysCompany:       { label: 'Sender → Company',  color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  CompanyPaysSender:       { label: 'Company → Sender',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
  CompanyPaysCourier:      { label: 'Company → Courier', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  CourierHandsOverRevenue: { label: 'Courier → Company', color: '#c47f17', bg: 'rgba(196,127,23,0.1)' },
};

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type, color: 'var(--color-text-muted)', bg: 'var(--color-bg-3)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: '0.7rem', fontWeight: 700,
      background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: 'In' | 'Out' }) {
  const isIn = direction === 'In';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: '0.7rem', fontWeight: 700,
      color: isIn ? '#10b981' : '#ef4444',
    }}>
      {isIn ? '↓ In' : '↑ Out'}
    </span>
  );
}

// ── Ledger table ──────────────────────────────────────────────────────────────

function LedgerTable({
  entries,
  total,
  page,
  pageSize,
  loading,
  typeFilter,
  onPageChange,
  onTypeChange,
}: {
  entries:      FinanceLedgerEntry[];
  total:        number;
  page:         number;
  pageSize:     number;
  loading:      boolean;
  typeFilter:   LedgerTypeFilter;
  onPageChange: (p: number) => void;
  onTypeChange: (t: LedgerTypeFilter) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const typeOptions: { value: LedgerTypeFilter; label: string }[] = [
    { value: '',                       label: 'All events'       },
    { value: 'SenderPaysCompany',      label: 'Sender → Company' },
    { value: 'CompanyPaysSender',      label: 'Company → Sender' },
    { value: 'CompanyPaysCourier',     label: 'Company → Courier'},
    { value: 'CourierHandsOverRevenue',label: 'Courier → Company'},
  ];

  return (
    <div style={{
      background: 'var(--color-bg-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      gridColumn: '1 / -1',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)', flex: 1 }}>
          Payment Ledger
          <span style={{
            marginLeft: 8, fontSize: '0.7rem', fontWeight: 600,
            color: 'var(--color-text-muted)',
          }}>
            ({fmtInt(total)} events)
          </span>
        </span>
        <select
          value={typeFilter}
          onChange={e => { onPageChange(0); onTypeChange(e.target.value as LedgerTypeFilter); }}
          style={{
            background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
            fontSize: '0.78rem', padding: '5px 10px', cursor: 'pointer',
          }}
        >
          {typeOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-3)' }}>
              {['Date', 'Type', 'Dir', 'Counterparty', 'Amount', 'Status', 'Note'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px',
                  textAlign: h === 'Amount' ? 'right' : 'left',
                  color: 'var(--color-text-muted)', fontWeight: 600,
                  borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No payment events found.
                </td>
              </tr>
            ) : entries.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '9px 14px', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                  {formatDate(e.createdAt)}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <TypeBadge type={e.type} />
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <DirectionBadge direction={e.direction} />
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--color-text)' }}>
                  {e.counterpartyName ?? '—'}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700,
                  color: e.direction === 'In' ? '#10b981' : '#ef4444' }}>
                  {e.direction === 'In' ? '+' : '−'}₾{fmt(e.amount)}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 9px', borderRadius: 100,
                    fontSize: '0.68rem', fontWeight: 700,
                    background: e.status === 'Confirmed'
                      ? 'rgba(16,185,129,0.1)'
                      : e.status === 'Pending'
                        ? 'rgba(180,83,9,0.1)'
                        : 'var(--color-bg-3)',
                    color: e.status === 'Confirmed'
                      ? '#10b981'
                      : e.status === 'Pending'
                        ? '#b45309'
                        : 'var(--color-text-muted)',
                  }}>
                    {e.status}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--color-text-subtle)', fontSize: '0.75rem', maxWidth: 200 }}>
                  {e.note ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 8, padding: '10px 20px', borderTop: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginRight: 'auto' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            style={{
              background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
              padding: '4px 12px', fontSize: '0.78rem', cursor: page === 0 ? 'not-allowed' : 'pointer',
              opacity: page === 0 ? 0.4 : 1,
            }}
          >
            ← Prev
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            style={{
              background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
              padding: '4px 12px', fontSize: '0.78rem', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages - 1 ? 0.4 : 1,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const MONTHS_OPTIONS = [3, 6, 12, 24];

export default function AdminFinancePage({ token }: { token: string }) {
  const [data,          setData]          = useState<AdminFinancePage | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [monthsBack,    setMonthsBack]    = useState(6);
  const [showUnpaidFees, setShowUnpaidFees] = useState(false);
  const [page,          setPage]          = useState(0);
  const [typeFilter,    setTypeFilter]    = useState<LedgerTypeFilter>('');

  const fetchData = useCallback(async (
    mb: number, pg: number, tf: LedgerTypeFilter, ledgerOnly = false,
  ) => {
    if (ledgerOnly) {
      setLedgerLoading(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const d = await getAdminFinanceSummary(token, mb, pg, 30, tf);
      setData(d);
    } catch {
      setError('Failed to load finance data.');
    } finally {
      setLoading(false);
      setLedgerLoading(false);
    }
  }, [token]);

  // Initial load on mount only — using ref avoids setState-in-effect lint warning
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    void fetchData(6, 0, '');
  }, [fetchData]);

  const handleMonthsChange = (mb: number) => {
    setMonthsBack(mb);
    setPage(0);
    fetchData(mb, 0, typeFilter);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchData(monthsBack, p, typeFilter, true);
  };

  const handleTypeChange = (tf: LedgerTypeFilter) => {
    setTypeFilter(tf);
    setPage(0);
    fetchData(monthsBack, 0, tf, true);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading finance data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
        {error ?? 'No data.'}
        <button
          onClick={() => fetchData(monthsBack, page, typeFilter)}
          style={{ marginLeft: 12, fontSize: '0.8rem', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Totals across all loaded months
  const summaries     = data.monthlySummaries;
  const totalGross    = summaries.reduce((s, m) => s + m.grossServiceRevenue,      0);
  const totalNet      = summaries.reduce((s, m) => s + m.netServiceIncome,         0);
  const totalSalaries = summaries.reduce((s, m) => s + m.totalCourierSalaries,     0);
  const totalCodOwed  = summaries.reduce((s, m) => s + m.totalCodOwedToSenders,    0);
  const totalReceived = summaries.reduce((s, m) => s + m.totalReceivedFromSenders, 0);
  const totalOrders   = summaries.reduce((s, m) => s + m.totalOrdersDelivered,     0);

  if (showUnpaidFees) {
    return <UnpaidFeesView token={token} onBack={() => setShowUnpaidFees(false)} />;
  }

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Finance Overview
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            Aggregated revenue, COD flows, and payment ledger
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={() => setShowUnpaidFees(true)}
            style={{
              padding: '5px 14px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 700,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.07)', color: '#ef4444',
              cursor: 'pointer', marginRight: 6,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Unpaid Fees
          </button>
          {MONTHS_OPTIONS.map(mo => (
            <button
              key={mo}
              onClick={() => handleMonthsChange(mo)}
              style={{
                padding: '5px 12px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
                border: '1px solid',
                borderColor: monthsBack === mo ? 'rgba(196,127,23,0.4)' : 'var(--color-border)',
                background:  monthsBack === mo ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
                color:        monthsBack === mo ? 'var(--color-accent)'     : 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              {mo}m
            </button>
          ))}
        </div>
      </div>

      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard
          label="Gross Service Revenue"
          value={`₾${fmt(totalGross)}`}
          sub={`${fmtInt(totalOrders)} orders delivered`}
          accent="var(--color-accent)"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 12l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Net Income"
          value={`₾${fmt(totalNet)}`}
          sub="After courier salaries"
          accent="#10b981"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 5v6M5.5 7.5L8 5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Courier Salaries Paid"
          value={`₾${fmt(totalSalaries)}`}
          accent="#6366f1"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M1.5 13c0-2.5 2-4 4.5-4M11 9l1.5 1.5L15 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Received from Senders"
          value={`₾${fmt(totalReceived)}`}
          sub="Service fee payments"
          accent="#10b981"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M1 7h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          }
        />
        <StatCard
          label="COD Owed to Senders"
          value={`₾${fmt(totalCodOwed)}`}
          sub={totalCodOwed > 0 ? 'Pending forwarding' : 'All forwarded ✓'}
          accent={totalCodOwed > 0 ? '#b45309' : '#10b981'}
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M8 10l-3-3M8 10l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      {/* Chart + table */}
      <div style={{ display: 'grid', gap: 16 }}>
        <BarChart summaries={summaries} />
        <MonthlySummaryTable summaries={summaries} />
        <LedgerTable
          entries={data.ledgerEntries}
          total={data.totalLedgerCount}
          page={data.page}
          pageSize={data.pageSize}
          loading={ledgerLoading}
          typeFilter={typeFilter}
          onPageChange={handlePageChange}
          onTypeChange={handleTypeChange}
        />
      </div>
    </div>
  );
}

// ── Unpaid Fees full-page view ────────────────────────────────────────────────

function UnpaidFeesView({ token, onBack }: { token: string; onBack: () => void }) {
  const [orders,  setOrders]  = useState<UnpaidFeeOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<'all' | 'Unpaid' | 'Pending'>('all');

  useEffect(() => {
    getUnpaidFeeOrders(token)
      .then(data => { setOrders(data); setLoading(false); })
      .catch(() => { setError('Failed to load outstanding fees.'); setLoading(false); });
  }, [token]);

  const fmt = (n: number) =>
    n.toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ka-GE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const filtered = (orders ?? []).filter(o => {
    if (filter !== 'all' && o.companyServicePaymentStatus !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.senderBusinessName.toLowerCase().includes(q) ||
      `${o.senderFirstName} ${o.senderLastName}`.toLowerCase().includes(q) ||
      o.senderPhone.includes(q) ||
      (o.customerPhone ?? '').includes(q) ||
      o.trackingNumber.toLowerCase().includes(q) ||
      o.recipientCity.toLowerCase().includes(q) ||
      o.recipientFirstName.toLowerCase().includes(q)
    );
  });

  const unpaidCount  = (orders ?? []).filter(o => o.companyServicePaymentStatus === 'Unpaid').length;
  const pendingCount = (orders ?? []).filter(o => o.companyServicePaymentStatus === 'Pending').length;
  const totalAmount  = filtered.reduce((s, o) => s + o.companyServicePrice, 0);

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: '0.82rem', fontWeight: 600, padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Finance
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--color-border)' }} />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Outstanding Service Fees
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Orders where service fee is unpaid or pending confirmation
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap',
      }}>
        {/* Status filter pills */}
        {(['all', 'Unpaid', 'Pending'] as const).map(f => {
          const count = f === 'all' ? (orders?.length ?? 0) : f === 'Unpaid' ? unpaidCount : pendingCount;
          const color = f === 'Unpaid' ? '#ef4444' : f === 'Pending' ? '#b45309' : 'var(--color-text-muted)';
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 14px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 700,
                border: `1px solid ${active ? color : 'var(--color-border)'}`,
                background: active ? `${color}15` : 'var(--color-bg-3)',
                color: active ? color : 'var(--color-text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {f === 'all' ? 'All' : f}
              <span style={{
                background: active ? `${color}25` : 'var(--color-border)',
                color: active ? color : 'var(--color-text-subtle)',
                borderRadius: 100, fontSize: '0.68rem', padding: '0 5px',
              }}>{count}</span>
            </button>
          );
        })}

        {/* Total amount */}
        {filtered.length > 0 && (
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginLeft: 4 }}>
            <strong style={{ color: 'var(--color-accent)' }}>&#x20be;{fmt(totalAmount)}</strong> total showing
          </span>
        )}

        {/* Search */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-subtle)', pointerEvents: 'none' }}>
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Sender, phone, tracking, recipient..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
              fontSize: '0.82rem', background: 'var(--color-bg-2)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)', outline: 'none', width: 260,
            }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading...
        </div>
      ) : error ? (
        <div style={{ padding: 24, color: '#ef4444', fontSize: '0.85rem',
          background: 'rgba(239,68,68,0.06)', borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
          {search || filter !== 'all' ? 'No orders match your filters.' : 'No outstanding service fees.'}
        </div>
      ) : (
        <div style={{
          background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-3)' }}>
                  {[
                    { label: 'Tracking',      align: 'left'  },
                    { label: 'Sender',        align: 'left'  },
                    { label: 'Business',      align: 'left'  },
                    { label: 'Customer Phone', align: 'left'  },
                    { label: 'Recipient',     align: 'left'  },
                    { label: 'City',          align: 'left'  },
                    { label: 'Recipient Phone', align: 'left' },
                    { label: 'Payer',         align: 'center'},
                    { label: 'Fee',           align: 'right' },
                    { label: 'Status',        align: 'center'},
                    { label: 'Delivered',     align: 'left'  },
                  ].map(h => (
                    <th key={h.label} style={{
                      padding: '9px 14px', textAlign: h.align as any, fontWeight: 700,
                      color: 'var(--color-text-muted)', fontSize: '0.68rem',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
                    }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => (
                  <tr key={o.orderId} style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : undefined,
                  }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace',
                      fontSize: '0.74rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {o.trackingNumber}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {o.senderFirstName} {o.senderLastName}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {o.senderBusinessName}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {o.customerPhone ?? o.senderPhone}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {o.recipientFirstName} {o.recipientLastName}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {o.recipientCity}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {o.recipientPhone}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 100,
                        fontSize: '0.65rem', fontWeight: 700,
                        background: o.whoPaysForCompanyService === 'Sender'
                          ? 'rgba(99,102,241,0.1)' : 'rgba(196,127,23,0.1)',
                        color: o.whoPaysForCompanyService === 'Sender' ? '#818cf8' : 'var(--color-accent)',
                      }}>
                        {o.whoPaysForCompanyService}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right',
                      color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                      &#x20be;{fmt(o.companyServicePrice)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 100,
                        fontSize: '0.65rem', fontWeight: 700,
                        background: o.companyServicePaymentStatus === 'Unpaid'
                          ? 'rgba(239,68,68,0.1)' : 'rgba(180,83,9,0.1)',
                        color: o.companyServicePaymentStatus === 'Unpaid' ? '#ef4444' : '#b45309',
                      }}>
                        {o.companyServicePaymentStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)',
                      fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {formatDate(o.deliveredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--color-border)',
            fontSize: '0.75rem', color: 'var(--color-text-subtle)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
            <span>Total outstanding: <strong style={{ color: 'var(--color-accent)' }}>&#x20be;{fmt(totalAmount)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
