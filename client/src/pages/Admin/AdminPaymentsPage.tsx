import { useState, useEffect, useCallback } from 'react';
import {
  getAdminPayments,
  confirmSenderPayment,
  markCompanyPaidSenderCod,
  markSettlementEvent,
  type AdminPaymentsPage,
  type AdminSenderPaymentRequest,
  type AdminCodOwedToSender,
  type AdminCourierSettlement,
  type PaymentOrderItem,
} from '../../api/payments';

// Re-export shape used in netting modal
type NettingModal = {
  sender:            AdminCodOwedToSender;
  selectedCodIds:    Set<string>;
  selectedFeeIds:    Set<string>;
  note:              string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ka-GE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, [string, string]> = {
    Pending:       ['rgba(180,83,9,0.1)',   '#b45309'],
    PartiallyPaid: ['rgba(99,102,241,0.1)', '#6366f1'],
    Confirmed:     ['rgba(30,126,90,0.1)',  '#1e7e5a'],
  };
  const [bg, color] = cfg[status] ?? ['rgba(107,114,128,0.1)', '#6b7280'];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: '0.72rem', fontWeight: 700, background: bg, color,
    }}>
      {status}
    </span>
  );
}

function PaymentStatusDot({ status }: { status: string }) {
  const color = status === 'Paid' ? '#1e7e5a' : status === 'Pending' ? '#b45309' : '#a8a19a';
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, flexShrink: 0,
    }} />
  );
}

function SectionCard({ title, icon, count, children, accent }: {
  title: string; icon: React.ReactNode; count?: number;
  children: React.ReactNode; accent?: string;
}) {
  return (
    <div style={{
      background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: accent ? `${accent}08` : undefined,
      }}>
        <span style={{ color: accent ?? 'var(--color-text-muted)' }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{
            marginLeft: 'auto', background: 'var(--color-accent-dim)',
            color: 'var(--color-accent)', border: '1px solid rgba(196,127,23,0.25)',
            borderRadius: 100, fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px',
          }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function OrdersExpandable({ orders }: { orders: PaymentOrderItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--color-accent)', fontSize: '0.78rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ transform: open ? 'rotate(90deg)' : undefined, transition: '150ms' }}>
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {open ? 'Hide' : `Show ${orders.length} order${orders.length !== 1 ? 's' : ''}`}
      </button>
      {open && (
        <div style={{
          marginTop: 10, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-3)' }}>
                {['Tracking', 'Recipient', 'City', 'Service Fee', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                    color: 'var(--color-text-subtle)', fontSize: '0.7rem',
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
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                    {o.trackingNumber}
                  </td>
                  <td style={{ padding: '6px 10px' }}>{o.recipientFirstName}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>
                    {o.recipientCity}
                  </td>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                    ₾{fmt(o.companyServicePrice)}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <PaymentStatusDot status={o.companyServicePaymentStatus} />
                      {o.companyServicePaymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Collect from Senders ─────────────────────────────────────────────────

function CollectFromSendersTab({
  token, data, onRefresh,
}: {
  token: string;
  data: AdminPaymentsPage['collectFromSenders'];
  onRefresh: () => void;
}) {
  const [confirmModal, setConfirmModal] = useState<{
    req: AdminSenderPaymentRequest; amount: string; note: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!confirmModal) return;
    const amount = parseFloat(confirmModal.amount);
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount.'); return; }
    setBusy(true); setError(null);
    try {
      await confirmSenderPayment(token, confirmModal.req.paymentRequestId, amount, confirmModal.note || undefined);
      setConfirmModal(null);
      onRefresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to confirm payment.');
    } finally {
      setBusy(false);
    }
  };

  const pending = data.pendingRequests;
  const unpaid  = data.unpaidGroups;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Pending requests */}
      <div>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--color-text-subtle)', marginBottom: 12 }}>
          Pending Requests ({pending.length})
        </p>
        {pending.length === 0 ? (
          <EmptyState label="No pending payment requests from senders." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(req => (
              <div key={req.paymentRequestId} style={{
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                padding: 16, background: 'var(--color-bg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{req.customerBusinessName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {req.customerPhone} · Submitted {formatDate(req.createdAt)}
                    </div>
                    {req.note && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 4,
                        fontStyle: 'italic' }}>"{req.note}"</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      ₾{fmt(req.totalAmount)}
                    </div>
                    {req.amountConfirmed > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: 2 }}>
                        ₾{fmt(req.amountConfirmed)} confirmed
                      </div>
                    )}
                    <StatusPill status={req.status} />
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <OrdersExpandable orders={req.orders} />
                  <button
                    onClick={() => setConfirmModal({ req, amount: String(req.totalAmount - req.amountConfirmed), note: '' })}
                    style={{
                      marginLeft: 'auto', padding: '6px 16px',
                      background: 'var(--color-accent)', color: '#fff',
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                    }}
                  >
                    Confirm Receipt
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unpaid (no request submitted) */}
      {unpaid.length > 0 && (
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--color-text-subtle)', marginBottom: 12 }}>
            Unpaid — No Request Submitted ({unpaid.length} senders)
          </p>
          <div style={{
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-3)' }}>
                  {['Sender', 'Phone', 'Orders', 'Unpaid Total'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700,
                      color: 'var(--color-text-subtle)', fontSize: '0.7rem',
                      textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unpaid.map((g, i) => (
                  <tr key={g.customerId} style={{
                    borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                  }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{g.customerBusinessName}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{g.customerPhone}</td>
                    <td style={{ padding: '10px 14px' }}>{g.orderCount}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-error)' }}>
                      ₾{fmt(g.totalUnpaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <Modal title="Confirm Payment Receipt" onClose={() => { setConfirmModal(null); setError(null); }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
            Confirming payment from <strong>{confirmModal.req.customerBusinessName}</strong>.
            Total due: <strong>₾{fmt(confirmModal.req.totalAmount)}</strong>
            {confirmModal.req.amountConfirmed > 0 && ` (₾${fmt(confirmModal.req.amountConfirmed)} already confirmed)`}.
          </p>
          <label style={labelStyle}>Amount Received (₾)</label>
          <input
            type="number" step="0.01" min="0.01"
            value={confirmModal.amount}
            onChange={e => setConfirmModal(v => v ? { ...v, amount: e.target.value } : v)}
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>Note (optional)</label>
          <input
            type="text"
            value={confirmModal.note}
            onChange={e => setConfirmModal(v => v ? { ...v, note: e.target.value } : v)}
            placeholder="e.g. Cash received at office"
            style={inputStyle}
          />
          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => { setConfirmModal(null); setError(null); }} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleConfirm} disabled={busy} style={primaryBtnStyle}>
              {busy ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Tab: Pay Senders COD (with netting) ──────────────────────────────────────

function PaySendersCodTab({
  token, senders, onRefresh,
}: {
  token: string;
  senders: AdminCodOwedToSender[];
  onRefresh: () => void;
}) {
  const [modal, setModal] = useState<NettingModal | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open modal: pre-select all COD orders, no fee offsets selected by default
  const openModal = (sender: AdminCodOwedToSender) => {
    setModal({
      sender,
      selectedCodIds: new Set(sender.codOrders.map(o => o.orderId)),
      selectedFeeIds: new Set(),
      note: '',
    });
    setError(null);
  };

  const toggleCod = (id: string) => {
    if (!modal) return;
    const next = new Set(modal.selectedCodIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setModal({ ...modal, selectedCodIds: next });
  };

  const toggleFee = (id: string) => {
    if (!modal) return;
    const next = new Set(modal.selectedFeeIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setModal({ ...modal, selectedFeeIds: next });
  };

  // Live calculations
  const grossCod = modal
    ? modal.sender.codOrders
        .filter(o => modal.selectedCodIds.has(o.orderId))
        .reduce((s, o) => s + (o.amountToCollectForPackage ?? 0), 0)
    : 0;

  const totalOffset = modal
    ? modal.sender.offsetEligibleFeeOrders
        .filter(o => modal.selectedFeeIds.has(o.orderId))
        .reduce((s, o) => s + o.companyServicePrice, 0)
    : 0;

  const netTransfer = Math.max(0, grossCod - totalOffset);
  const remainingFees = Math.max(0, totalOffset - grossCod); // if fees > COD

  const handleConfirm = async () => {
    if (!modal) return;
    if (modal.selectedCodIds.size === 0) { setError('Select at least one COD order.'); return; }
    setBusy(true); setError(null);
    try {
      await markCompanyPaidSenderCod(
        token,
        modal.sender.customerId,
        [...modal.selectedCodIds],
        [...modal.selectedFeeIds],
        modal.note || undefined,
      );
      setModal(null);
      onRefresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to record payment.');
    } finally {
      setBusy(false);
    }
  };

  if (senders.length === 0) return <EmptyState label="No COD payments owed to senders." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {senders.map(sender => (
        <div key={sender.customerId} style={{
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          padding: 16, background: 'var(--color-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{sender.customerBusinessName}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {sender.customerPhone} · {sender.codOrders.length} COD order{sender.codOrders.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>
                ₾{fmt(sender.totalCodOwed)}
              </div>
              {sender.totalServiceFeesOwed > 0 && (
                <div style={{ fontSize: '0.72rem', marginTop: 3 }}>
                  <span style={{ color: '#10b981' }}>− ₾{fmt(sender.totalServiceFeesOwed)} fees owed</span>
                  <span style={{ color: 'var(--color-text-subtle)', marginLeft: 4 }}>
                    → net ₾{fmt(sender.suggestedNetTransfer)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <OrdersExpandable orders={sender.codOrders} />
            <button onClick={() => openModal(sender)} style={{ ...primaryBtnStyle, marginLeft: 'auto' }}>
              Settle with Sender
            </button>
          </div>
        </div>
      ))}

      {/* Netting modal */}
      {modal && (
        <Modal
          title={`Settle with ${modal.sender.customerBusinessName}`}
          onClose={() => { setModal(null); setError(null); }}
        >
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>

            {/* COD orders checklist */}
            <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: 'var(--color-text-subtle)', marginBottom: 8 }}>
              COD Orders to Pay Out
            </p>
            <div style={{
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              overflow: 'hidden', marginBottom: 16,
            }}>
              {modal.sender.codOrders.map((o, i) => (
                <label key={o.orderId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', cursor: 'pointer',
                  borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                  background: modal.selectedCodIds.has(o.orderId) ? 'rgba(196,127,23,0.05)' : undefined,
                }}>
                  <input
                    type="checkbox"
                    checked={modal.selectedCodIds.has(o.orderId)}
                    onChange={() => toggleCod(o.orderId)}
                    style={{ accentColor: 'var(--color-accent)', width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                    {o.trackingNumber}
                  </span>
                  <span style={{ fontSize: '0.82rem', flex: 1 }}>{o.recipientFirstName} · {o.recipientCity}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>
                    ₾{fmt(o.amountToCollectForPackage ?? 0)}
                  </span>
                </label>
              ))}
            </div>

            {/* Fee offset checklist */}
            {modal.sender.offsetEligibleFeeOrders.length > 0 && (
              <>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--color-text-subtle)', marginBottom: 4 }}>
                  Offset Service Fees (select to deduct from COD)
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  These are orders where {modal.sender.customerBusinessName} owes the company a service fee.
                  Checking them deducts the fee from the COD payout instead of collecting separately.
                </p>
                <div style={{
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden', marginBottom: 16,
                }}>
                  {modal.sender.offsetEligibleFeeOrders.map((o, i) => (
                    <label key={o.orderId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', cursor: 'pointer',
                      borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                      background: modal.selectedFeeIds.has(o.orderId) ? 'rgba(16,185,129,0.05)' : undefined,
                    }}>
                      <input
                        type="checkbox"
                        checked={modal.selectedFeeIds.has(o.orderId)}
                        onChange={() => toggleFee(o.orderId)}
                        style={{ accentColor: '#10b981', width: 15, height: 15, flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                        {o.trackingNumber}
                      </span>
                      <span style={{ fontSize: '0.82rem', flex: 1 }}>{o.recipientFirstName} · {o.recipientCity}</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#10b981', flexShrink: 0 }}>
                        − ₾{fmt(o.companyServicePrice)}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* Live calculation summary */}
            <div style={{
              background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Gross COD (selected)</span>
                <span style={{ fontWeight: 600 }}>₾{fmt(grossCod)}</span>
              </div>
              {totalOffset > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                  <span style={{ color: '#10b981' }}>Service fee offset</span>
                  <span style={{ fontWeight: 600, color: '#10b981' }}>− ₾{fmt(totalOffset)}</span>
                </div>
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem',
                fontWeight: 800, marginTop: totalOffset > 0 ? 6 : 0,
                borderTop: totalOffset > 0 ? '1px solid var(--color-border)' : undefined,
                paddingTop: totalOffset > 0 ? 6 : 0,
              }}>
                <span>Net transfer to sender</span>
                <span style={{ color: netTransfer > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                  ₾{fmt(netTransfer)}
                </span>
              </div>
              {remainingFees > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: 6 }}>
                  ⚠ Fee offset (₾{fmt(totalOffset)}) exceeds COD (₾{fmt(grossCod)}).
                  Remaining ₾{fmt(remainingFees)} will be marked paid but still tracked as a company receivable offset.
                </div>
              )}
            </div>

            {/* Note */}
            <label style={labelStyle}>Note (optional)</label>
            <input
              type="text"
              value={modal.note}
              onChange={e => setModal(m => m ? { ...m, note: e.target.value } : m)}
              placeholder="e.g. Bank transfer ref. 12345"
              style={inputStyle}
            />
          </div>

          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
            <button onClick={() => { setModal(null); setError(null); }} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleConfirm} disabled={busy || modal.selectedCodIds.size === 0} style={primaryBtnStyle}>
              {busy ? 'Saving…' : `Confirm — Pay ₾${fmt(netTransfer)}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Tab: Courier Settlements ──────────────────────────────────────────────────

function CourierSettlementsTab({
  token, settlements, onRefresh,
}: {
  token: string;
  settlements: AdminCourierSettlement[];
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = async (
    settlementId: string,
    eventType: 'CompanyPaysCourier' | 'CourierHandsOverRevenue',
  ) => {
    setBusy(settlementId + eventType); setError(null);
    try {
      await markSettlementEvent(token, settlementId, eventType);
      onRefresh();
    } catch (e: any) {
      setError(e.message ?? 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  if (settlements.length === 0) return <EmptyState label="No settlement records found." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)',
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}
      {settlements.map(s => (
        <div key={s.settlementId} style={{
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--color-bg)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-3)',
          }}>
            <div>
              <span style={{ fontWeight: 700 }}>{s.courierFullName}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginLeft: 10 }}>
                {formatDate(s.settlementDate)}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              {s.totalOrdersDelivered} delivered · {s.totalOrdersPickedUp} picked up
            </div>
          </div>

          {/* Financials grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12, padding: 16,
          }}>
            {[
              ['Courier Salary',    s.totalCourierSalary,           '#1e7e5a'],
              ['Transfer to Co.',   s.totalCourierTransferToCompany,'#6366f1'],
              ['Service Revenue',   s.totalCompanyServiceRevenue,   'var(--color-accent)'],
              ['Net Income',        s.totalCompanyNetIncome,        'var(--color-text)'],
              ['Cash Collected',    s.totalAmountOfCashCollected ?? 0, 'var(--color-text-muted)'],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--color-text-subtle)', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: color as string }}>
                  ₾{fmt(value as number)}
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{
            display: 'flex', gap: 10, padding: '10px 16px',
            borderTop: '1px solid var(--color-border)', flexWrap: 'wrap',
          }}>
            {/* Courier salary */}
            {s.wasCourierPaid ? (
              <PaidBadge label={`Salary paid ${formatDate(s.courierPaidAt)}`} />
            ) : (
              <button
                onClick={() => mark(s.settlementId, 'CompanyPaysCourier')}
                disabled={busy === s.settlementId + 'CompanyPaysCourier'}
                style={outlineBtnStyle}
              >
                {busy === s.settlementId + 'CompanyPaysCourier' ? 'Saving…' : `Mark Salary Paid (₾${fmt(s.totalCourierSalary)})`}
              </button>
            )}

            {/* Revenue handover */}
            {s.hasCourierHandedOverRevenue ? (
              <PaidBadge label={`Revenue received ${formatDate(s.revenueHandedOverAt)}`} />
            ) : (
              <button
                onClick={() => mark(s.settlementId, 'CourierHandsOverRevenue')}
                disabled={busy === s.settlementId + 'CourierHandsOverRevenue'}
                style={outlineBtnStyle}
              >
                {busy === s.settlementId + 'CourierHandsOverRevenue'
                  ? 'Saving…'
                  : `Revenue Received (₾${fmt(s.totalCourierTransferToCompany)})`}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PaidBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 'var(--radius-sm)',
      background: 'var(--color-success-bg)', color: 'var(--color-success)',
      fontSize: '0.78rem', fontWeight: 600,
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3.5 6l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'senders' | 'cod' | 'settlements';

export default function AdminPaymentsPage({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>('senders');
  const [data, setData] = useState<AdminPaymentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await getAdminPayments(token);
      setData(d);
    } catch (e: any) {
      setError('Failed to load payments data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const tabs: [Tab, string, string][] = [
    ['senders',     'Collect from Senders',    data ? String(data.collectFromSenders.pendingRequests.length) : '—'],
    ['cod',         'Pay Senders COD',          data ? String(data.payToSenders.length) : '—'],
    ['settlements', 'Courier Settlements',      data ? String(data.courierSettlements.length) : '—'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 6, borderBottom: '1px solid var(--color-border)', paddingBottom: 0,
      }}>
        {tabs.map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === key ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderBottom: tab === key ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 150ms',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            {label}
            <span style={{
              background: tab === key ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
              color: tab === key ? 'var(--color-accent)' : 'var(--color-text-subtle)',
              borderRadius: 100, fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px',
            }}>
              {badge}
            </span>
          </button>
        ))}
        <button
          onClick={load}
          title="Refresh"
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--color-text-subtle)', padding: '8px 10px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 1 0 1-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
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
        <>
          {tab === 'senders' && (
            <SectionCard
              title="Collect from Senders"
              icon={inboxIcon}
              count={data.collectFromSenders.pendingRequests.length}
              accent="#b45309"
            >
              <CollectFromSendersTab
                token={token}
                data={data.collectFromSenders}
                onRefresh={load}
              />
            </SectionCard>
          )}
          {tab === 'cod' && (
            <SectionCard
              title="Pay Senders COD"
              icon={outboxIcon}
              count={data.payToSenders.length}
              accent="#6366f1"
            >
              <PaySendersCodTab
                token={token}
                senders={data.payToSenders}
                onRefresh={load}
              />
            </SectionCard>
          )}
          {/* Tab badge: also show net suggestion */}
          {tab === 'settlements' && (
            <SectionCard
              title="Courier Settlements"
              icon={settlementIcon}
              count={data.courierSettlements.length}
              accent="var(--color-accent)"
            >
              <CourierSettlementsTab
                token={token}
                settlements={data.courierSettlements}
                onRefresh={load}
              />
            </SectionCard>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '32px 16px',
      color: 'var(--color-text-subtle)', fontSize: '0.85rem',
    }}>
      {label}
    </div>
  );
}

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
        width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-md)',
        padding: 24,
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

const outlineBtnStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'none',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const inboxIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M1 9h4l1.5 2h3L11 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const outboxIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M8 6V11M5.5 8.5L8 6l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const settlementIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M4.5 8h7M4.5 5.5h4M4.5 10.5h5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
