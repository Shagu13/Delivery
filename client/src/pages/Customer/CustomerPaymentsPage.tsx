import { useState, useEffect, useCallback } from 'react';
import {
  getMyPayments,
  createPaymentRequest,
  type CustomerPaymentsPage,
  type CustomerCodPayout,
  type CompanyServicePaymentStatus,
} from '../../api/payments';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ka-GE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function PayStatusBadge({ status }: { status: CompanyServicePaymentStatus | string }) {
  const cfg: Record<string, [string, string, string]> = {
    Unpaid:  ['var(--color-error-bg)',   'var(--color-error)',   'Unpaid'],
    Pending: ['var(--color-warning-bg)', 'var(--color-warning)', 'Pending'],
    Paid:    ['var(--color-success-bg)', 'var(--color-success)', 'Paid'],
  };
  const [bg, color, label] = cfg[status] ?? ['var(--color-bg-3)', 'var(--color-text-subtle)', status];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 100,
      fontSize: '0.7rem', fontWeight: 700, background: bg, color,
    }}>
      {label}
    </span>
  );
}

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)', padding: '14px 18px', flex: '1 1 150px',
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--color-text-subtle)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: color ?? 'var(--color-text)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Service fee section ───────────────────────────────────────────────────────

function ServiceFeeSection({
  token, data, onRefresh,
}: {
  token: string;
  data: CustomerPaymentsPage;
  onRefresh: () => void;
}) {
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [note, setNote]             = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<CompanyServicePaymentStatus | 'All'>('All');
  const [filterDelivered, setFilterDelivered] = useState(false);

  const orders = data.serviceFeeOrders.filter(o => {
    if (filterDelivered && o.orderStatus !== 'DeliveredToRecipient') return false;
    if (filterStatus !== 'All' && o.companyServicePaymentStatus !== filterStatus) return false;
    return true;
  });

  const eligibleIds = orders
    .filter(o => o.companyServicePaymentStatus === 'Unpaid')
    .map(o => o.orderId);

  const selectedEligible = [...selected].filter(id => eligibleIds.includes(id));
  const selectedTotal = selectedEligible.reduce((s, id) => {
    const o = orders.find(x => x.orderId === id);
    return s + (o?.companyServicePrice ?? 0);
  }, 0);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedEligible.length === eligibleIds.length) setSelected(new Set());
    else setSelected(new Set(eligibleIds));
  };

  const handleSubmit = async () => {
    if (selectedEligible.length === 0) return;
    setBusy(true); setError(null);
    try {
      await createPaymentRequest(token, selectedEligible, note || undefined);
      setSelected(new Set()); setNote(''); setShowConfirm(false);
      onRefresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit payment request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard label="Unpaid" value={`₾${fmt(data.totalServiceFeeUnpaid)}`} color="var(--color-error)" />
        <SummaryCard label="Pending" value={`₾${fmt(data.totalServiceFeePending)}`} color="var(--color-warning)" />
        <SummaryCard label="Paid" value={`₾${fmt(data.totalServiceFeePaid)}`} color="var(--color-success)" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setFilterDelivered(v => !v)} style={{
          padding: '5px 12px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
          background: filterDelivered ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
          color: filterDelivered ? 'var(--color-accent)' : 'var(--color-text-muted)',
          border: filterDelivered ? '1px solid rgba(196,127,23,0.3)' : '1px solid var(--color-border)',
          cursor: 'pointer',
        }}>
          Delivered only
        </button>
        {(['All', 'Unpaid', 'Pending', 'Paid'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            padding: '5px 12px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
            background: filterStatus === s ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
            color: filterStatus === s ? 'var(--color-accent)' : 'var(--color-text-muted)',
            border: filterStatus === s ? '1px solid rgba(196,127,23,0.3)' : '1px solid var(--color-border)',
            cursor: 'pointer',
          }}>
            {s}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedEligible.length > 0 && (
        <div style={{
          background: 'var(--color-accent-dim)', border: '1px solid rgba(196,127,23,0.3)',
          borderRadius: 'var(--radius-sm)', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            {selectedEligible.length} order{selectedEligible.length !== 1 ? 's' : ''} selected
            &nbsp;·&nbsp;
            <strong>₾{fmt(selectedTotal)}</strong>
          </span>
          <button
            onClick={() => { setShowConfirm(true); setError(null); }}
            style={{
              marginLeft: 'auto', padding: '6px 18px',
              background: 'var(--color-accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Submit Payment
          </button>
        </div>
      )}

      {/* Orders table */}
      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px',
          color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>
          No orders found for this filter.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-3)' }}>
                <th style={{ padding: '8px 12px', width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selectedEligible.length === eligibleIds.length && eligibleIds.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                {['Tracking', 'Type', 'Recipient', 'City / District', 'Fee', 'Status', 'Delivered'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                    color: 'var(--color-text-subtle)', fontSize: '0.68rem',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const isEligible = o.companyServicePaymentStatus === 'Unpaid';
                const isChecked  = selected.has(o.orderId);
                return (
                  <tr key={o.orderId} style={{
                    borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                    background: isChecked ? 'var(--color-accent-dim)' : undefined,
                  }}>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        type="checkbox"
                        disabled={!isEligible}
                        checked={isChecked}
                        onChange={() => toggle(o.orderId)}
                        style={{ cursor: isEligible ? 'pointer' : 'default' }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace',
                      fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {o.trackingNumber}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '1px 7px', borderRadius: 99,
                        fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        background: o.orderType === 'Return'   ? 'rgba(239,68,68,0.1)'
                                  : o.orderType === 'Exchange' ? 'rgba(59,130,246,0.1)'
                                  : 'rgba(16,185,129,0.1)',
                        color:      o.orderType === 'Return'   ? '#ef4444'
                                  : o.orderType === 'Exchange' ? '#3b82f6'
                                  : '#10b981',
                      }}>
                        {o.orderType}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{o.recipientFirstName}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>
                      {o.recipientCity}, {o.recipientDistrict}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                      ₾{fmt(o.companyServicePrice)}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <PayStatusBadge status={o.companyServicePaymentStatus} />
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--color-text-subtle)',
                      fontSize: '0.75rem' }}>
                      {formatDate(o.deliveredAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <Modal title="Submit Payment Request" onClose={() => { setShowConfirm(false); setError(null); }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
            You are submitting a payment of{' '}
            <strong style={{ color: 'var(--color-text)', fontSize: '1rem' }}>
              ₾{fmt(selectedTotal)}
            </strong>{' '}
            for <strong>{selectedEligible.length}</strong> order{selectedEligible.length !== 1 ? 's' : ''}.
            The Company will confirm once payment is received.
          </p>
          <label style={labelStyle}>Note (optional)</label>
          <input
            type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Bank transfer sent on 12 Jun"
            style={inputStyle}
          />
          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowConfirm(false); setError(null); }} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleSubmit} disabled={busy} style={primaryBtnStyle}>
              {busy ? 'Submitting…' : 'Confirm & Submit'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── COD Income section ────────────────────────────────────────────────────────

function CodIncomeSection({ data }: { data: CustomerPaymentsPage }) {
  const [filterPaid, setFilterPaid] = useState<'all' | 'pending' | 'received'>('all');

  // Delivered but company hasn't paid the sender yet — owed NOW
  const owedNow = data.codIncomeOrders
    .filter(o => !o.hasCompanyPaidTheSender && o.deliveredAt)
    .reduce((s, o) => s + o.amountCollected, 0);

  // Not yet delivered — expected once order completes
  const expectedLater = data.codIncomeOrders
    .filter(o => !o.hasCompanyPaidTheSender && !o.deliveredAt)
    .reduce((s, o) => s + o.amountCollected, 0);

  const orders = data.codIncomeOrders.filter(o => {
    if (filterPaid === 'pending')  return !o.hasCompanyPaidTheSender;
    if (filterPaid === 'received') return  o.hasCompanyPaidTheSender;
    return true;
  });

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard
          label="Owed to You (Delivered)"
          value={`₾${fmt(owedNow)}`}
          sub="Delivered — awaiting company transfer"
          color="var(--color-error)"
        />
        <SummaryCard
          label="Expected (In Transit)"
          value={`₾${fmt(expectedLater)}`}
          sub="Orders not yet delivered"
          color="var(--color-warning)"
        />
        <SummaryCard
          label="Received"
          value={`₾${fmt(data.totalCodReceived)}`}
          sub="Already paid to you"
          color="var(--color-success)"
        />
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {([['all', 'All'], ['pending', 'Pending'], ['received', 'Received']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilterPaid(v)} style={{
            padding: '5px 12px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
            background: filterPaid === v ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
            color: filterPaid === v ? 'var(--color-accent)' : 'var(--color-text-muted)',
            border: filterPaid === v ? '1px solid rgba(196,127,23,0.3)' : '1px solid var(--color-border)',
            cursor: 'pointer',
          }}>
            {l}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px',
          color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>
          No COD income orders found.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-3)' }}>
                {['Tracking', 'Recipient', 'City', 'Amount', 'Order Status', 'Payout Status', 'Delivered'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                    color: 'var(--color-text-subtle)', fontSize: '0.68rem',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={o.orderId} style={{
                  borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace',
                    fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {o.trackingNumber}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{o.recipientFirstName}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>{o.recipientCity}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>₾{fmt(o.amountCollected)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {o.deliveredAt ? (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '0.78rem' }}>Delivered</span>
                    ) : (
                      <span style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: '0.78rem' }}>In Transit</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {o.hasCompanyPaidTheSender ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        color: 'var(--color-success)', fontWeight: 600, fontSize: '0.78rem',
                      }}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M3.5 6l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Paid
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        color: 'var(--color-error)', fontWeight: 600, fontSize: '0.78rem',
                      }}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M6 3.5v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        Pending
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-subtle)', fontSize: '0.75rem' }}>
                    {formatDate(o.deliveredAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CodPayoutsSection payouts={data.codPayouts ?? []} />
    </div>
  );
}

// ── COD Payout History ────────────────────────────────────────────────────────

function CodPayoutsSection({ payouts }: { payouts: CustomerCodPayout[] }) {
  if (payouts.length === 0) return null;

  const fmt = (n: number) =>
    n.toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ marginTop: 28 }}>
      <p style={{
        fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--color-text-subtle)', marginBottom: 12,
      }}>
        Payout History ({payouts.length})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {payouts.map(p => {
          const hasOffset = p.serviceFeeOffset > 0;
          return (
            <div key={p.paymentRequestId} style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg)',
              overflow: 'hidden',
            }}>
              {/* Header row */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: hasOffset ? 'rgba(99,102,241,0.04)' : undefined,
                borderBottom: hasOffset ? '1px solid var(--color-border)' : undefined,
                flexWrap: 'wrap', gap: 8,
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-success)' }}>
                    ₾{fmt(p.netAmountPaid)} received
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 10 }}>
                    {p.orderCount} order{p.orderCount !== 1 ? 's' : ''} ·{' '}
                    {new Date(p.paidAt).toLocaleDateString('ka-GE', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 10px',
                  borderRadius: 100,
                  background: 'var(--color-success-bg)', color: 'var(--color-success)',
                }}>
                  Paid
                </span>
              </div>

              {/* Breakdown — only shown when netting was applied */}
              {hasOffset && (
                <div style={{ padding: '10px 14px' }}>
                  <div style={{
                    display: 'inline-flex', flexDirection: 'column', gap: 4,
                    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                    fontSize: '0.82rem', minWidth: 260,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Gross COD</span>
                      <span style={{ fontWeight: 600 }}>₾{fmt(p.grossCod)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                      <span style={{ color: '#6366f1' }}>Service fees deducted</span>
                      <span style={{ fontWeight: 600, color: '#6366f1' }}>− ₾{fmt(p.serviceFeeOffset)}</span>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', gap: 24,
                      borderTop: '1px solid var(--color-border)', paddingTop: 4, marginTop: 2,
                      fontWeight: 800,
                    }}>
                      <span>Net transferred</span>
                      <span style={{ color: 'var(--color-success)' }}>₾{fmt(p.netAmountPaid)}</span>
                    </div>
                  </div>
                  {p.note && (
                    <div style={{
                      fontSize: '0.72rem', color: 'var(--color-text-subtle)',
                      marginTop: 8, fontStyle: 'italic',
                    }}>
                      {p.note}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Payment Request History ───────────────────────────────────────────────────

function RequestHistorySection({ data }: { data: CustomerPaymentsPage }) {
  const requests = data.paymentRequests;
  if (requests.length === 0)
    return <div style={{ textAlign: 'center', padding: '32px 16px',
      color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>
      No payment requests submitted yet.
    </div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {requests.map(r => (
        <div key={r.paymentRequestId} style={{
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          padding: '12px 16px', background: 'var(--color-bg)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontWeight: 700 }}>₾{fmt(r.totalAmount)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {r.orderCount} order{r.orderCount !== 1 ? 's' : ''} · Submitted {formatDate(r.createdAt)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <RequestStatusBadge status={r.status} />
            {r.amountConfirmed > 0 && r.status !== 'Confirmed' && (
              <div style={{ fontSize: '0.72rem', color: '#6366f1' }}>
                ₾{fmt(r.amountConfirmed)} confirmed
              </div>
            )}
            {r.confirmedAt && (
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                Confirmed {formatDate(r.confirmedAt)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, [string, string]> = {
    Pending:       ['var(--color-warning-bg)', 'var(--color-warning)'],
    PartiallyPaid: ['rgba(99,102,241,0.1)',    '#6366f1'],
    Confirmed:     ['var(--color-success-bg)', 'var(--color-success)'],
  };
  const [bg, color] = cfg[status] ?? ['var(--color-bg-3)', 'var(--color-text-subtle)'];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: '0.7rem', fontWeight: 700, background: bg, color,
    }}>
      {status}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'fees' | 'cod' | 'history';

export default function CustomerPaymentsPage({ token }: { token: string }) {
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab,   setTab]   = useState<Tab>('fees');
  const [data,  setData]  = useState<CustomerPaymentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await getMyPayments(token, year, month);
      setData(d);
    } catch {
      setError('Failed to load payments data.');
    } finally {
      setLoading(false);
    }
  }, [token, year, month]);

  useEffect(() => { load(); }, [load]);

  const goMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1;  y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  const tabs: [Tab, string][] = [
    ['fees',    'Service Fees'],
    ['cod',     'COD Income'],
    ['history', 'Request History'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Month picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => goMonth(-1)} style={navBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', minWidth: 150, textAlign: 'center' }}>
          {MONTHS[month - 1]} {year}
        </span>
        <button
          onClick={() => goMonth(1)}
          disabled={year === now.getFullYear() && month === now.getMonth() + 1}
          style={navBtnStyle}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button onClick={load} title="Refresh" style={{ ...navBtnStyle, marginLeft: 4 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 1 0 1-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            color: tab === key ? 'var(--color-accent)' : 'var(--color-text-muted)',
            borderBottom: tab === key ? '2px solid var(--color-accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 150ms', whiteSpace: 'nowrap',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="go-spinner" />
        </div>
      ) : error ? (
        <div style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)',
          padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
          {error}
        </div>
      ) : data ? (
        <div style={{
          background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 20,
        }}>
          {tab === 'fees'    && <ServiceFeeSection token={token} data={data} onRefresh={load} />}
          {tab === 'cod'     && <CodIncomeSection data={data} />}
          {tab === 'history' && <RequestHistorySection data={data} />}
        </div>
      ) : null}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: 'var(--color-bg-2)', borderRadius: 'var(--radius-md)',
        width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-md)', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', padding: '6px 10px', cursor: 'pointer',
  color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 700,
  color: 'var(--color-text-muted)', marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
  fontSize: '0.88rem', color: 'var(--color-text)', outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '7px 18px', background: 'var(--color-accent)', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-sm)',
  fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 18px', background: 'var(--color-bg-3)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
};
