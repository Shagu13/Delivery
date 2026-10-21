import { useState, useEffect, useCallback } from 'react';
import { getTenants } from '../../api/tenants';
import type { Tenant } from '../../api/tenants';
import {
  getTenantSettlementOrders, recordTenantOrderPayment,
} from '../../api/tenantSettlements';
import type { TenantSettlementOrders, TenantSettlementOrder } from '../../api/tenantSettlements';

const gel = (n: number) => `₾${n.toFixed(2)}`;
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const sel: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
  background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.88rem',
};
const td: React.CSSProperties = { padding: '7px 10px', fontSize: '0.8rem', verticalAlign: 'top', borderTop: '1px solid var(--color-border)' };
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-subtle)', background: 'var(--color-bg-2)', whiteSpace: 'nowrap' };

/** One amount with a "paid in full" tick and a partial-amount field. */
function PayCell({ amount, paid, disabled, busy, onFull, onPartial, onClear }: {
  amount: number; paid: number; disabled?: boolean; busy: boolean;
  onFull: () => void; onPartial: (n: number) => void; onClear: () => void;
}) {
  const [val, setVal] = useState(paid > 0 ? String(paid) : '');
  const full = amount > 0.005 && paid >= amount - 0.005;

  if (disabled) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontWeight: 700 }}>{gel(amount)}</span>
      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)' }}>collected at delivery</span>
    </div>;
  }

  const apply = () => {
    const a = parseFloat(val);
    if (val.trim() === '') { if (paid > 0) onClear(); return; }
    if (!isNaN(a) && a > 0 && Math.abs(a - paid) > 0.005) onPartial(a);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontWeight: 700, minWidth: 52 }}>{gel(amount)}</span>
      <input type="checkbox" checked={full} disabled={busy || amount <= 0.005}
        title="Paid in full" onChange={e => (e.target.checked ? onFull() : onClear())} />
      <input type="number" min="0" step="0.01" placeholder="0" value={val} disabled={busy}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') apply(); }}
        onBlur={apply}
        style={{ width: 64, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--color-border)',
          background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.8rem' }} />
      {paid > 0.005 && !full && <span style={{ fontSize: '0.66rem', color: '#b45309' }}>partial</span>}
    </div>
  );
}

export default function AdminTenantSettlementsPage({ token }: { token: string }) {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [date, setDate]         = useState(toDateStr(new Date()));
  const [monthly, setMonthly]   = useState(false);
  const [data, setData]         = useState<TenantSettlementOrders | null>(null);
  const [loading, setLoading]   = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    getTenants(token).then(ts => { setTenants(ts); if (ts.length && !tenantId) setTenantId(ts[0].id); }).catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = useCallback(() => {
    if (!tenantId) { setData(null); return; }
    setLoading(true); setError(null);
    getTenantSettlementOrders(token, tenantId, date, monthly)
      .then(setData)
      .catch(() => setError('Failed to load orders.'))
      .finally(() => setLoading(false));
  }, [token, tenantId, date, monthly]);

  useEffect(() => { load(); }, [load]);

  const shiftDay = (delta: number) => setDate(prev => {
    const d = new Date(prev + 'T00:00:00'); d.setDate(d.getDate() + delta); return toDateStr(d);
  });

  const pay = async (o: TenantSettlementOrder, body: Partial<{ codPaid: boolean; codPaidAmount: number; servicePaid: boolean; servicePaidAmount: number }>) => {
    setBusyId(o.orderId); setError(null);
    try {
      await recordTenantOrderPayment(token, { tenantId, orderId: o.orderId, ...body });
      load();
    } catch {
      setError('Failed to record payment.');
    } finally {
      setBusyId(null);
    }
  };

  const card = (label: string, value: string, accent = false) => (
    <div style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)',
      border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`,
      borderRadius: 10, padding: '12px 14px', minWidth: 150 }}>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)', marginTop: 3 }}>{label}</div>
    </div>
  );

  const fmtD = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Tenant Settlements</h2>
        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
          Per-order settlement with a tenant: pay the COD dilo collected, and record the service fees the tenant owes.
        </p>
      </div>

      {tenants.length === 0 ? (
        <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>No tenants yet.</div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={sel}>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
            <button className="btn-ghost btn-ghost--sm" onClick={() => shiftDay(-1)} disabled={monthly}>‹</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={sel} />
            <button className="btn-ghost btn-ghost--sm" onClick={() => shiftDay(1)} disabled={monthly}>›</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={monthly} onChange={e => setMonthly(e.target.checked)} /> Whole month
            </label>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>by delivered date</span>
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

          {/* Summary */}
          {data && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {card('COD owed to tenant', gel(data.totalCod), true)}
              {card('COD paid', gel(data.totalCodPaid))}
              {card('COD outstanding', gel(data.totalCod - data.totalCodPaid))}
              {card('Service owed by tenant', gel(data.totalService))}
              {card('Service paid', gel(data.totalServicePaid))}
              {card('Service outstanding', gel(data.totalService - data.totalServicePaid))}
            </div>
          )}

          {/* Orders */}
          {loading ? (
            <div style={{ padding: 24, color: 'var(--color-text-subtle)' }}>Loading…</div>
          ) : !data || data.orders.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>No delivered orders for this selection.</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead>
                  <tr>
                    {['Business', 'Customer', 'Recipient', 'Address', 'Created', 'Delivered', 'COD', 'Service', 'Who pays service'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map(o => {
                    const busy = busyId === o.orderId;
                    const senderPays = o.whoPaysForCompanyService === 'Sender';
                    return (
                      <tr key={o.orderId}>
                        <td style={td}><div style={{ fontWeight: 600 }}>{o.businessName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontFamily: 'monospace' }}>{o.trackingNumber}</div></td>
                        <td style={td}>{o.customerName}</td>
                        <td style={td}>{o.recipientName}</td>
                        <td style={{ ...td, maxWidth: 180, color: 'var(--color-text-subtle)' }}>{o.recipientCity}, {o.recipientAddress}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--color-text-subtle)' }}>{fmtD(o.createdAt)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--color-text-subtle)' }}>{fmtD(o.deliveredAt)}</td>
                        <td style={td}>
                          <PayCell key={`cod:${o.orderId}:${o.codPaidToTenant}`} amount={o.cod} paid={o.codPaidToTenant} busy={busy}
                            onFull={() => pay(o, { codPaid: true })}
                            onPartial={a => pay(o, { codPaid: true, codPaidAmount: a })}
                            onClear={() => pay(o, { codPaid: false })} />
                        </td>
                        <td style={td}>
                          <PayCell key={`svc:${o.orderId}:${o.servicePaidByTenant}`} amount={o.serviceOwed || (senderPays ? o.companyServicePrice : 0)} paid={o.servicePaidByTenant}
                            disabled={!senderPays && o.serviceOwed <= 0.005} busy={busy}
                            onFull={() => pay(o, { servicePaid: true })}
                            onPartial={a => pay(o, { servicePaid: true, servicePaidAmount: a })}
                            onClear={() => pay(o, { servicePaid: false })} />
                        </td>
                        <td style={{ ...td, color: 'var(--color-text-subtle)' }}>
                          {o.whoPaysForCompanyService}
                          {!senderPays && o.customerSurcharge > 0.005 && (
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#b45309' }}>+{gel(o.customerSurcharge)} owed by tenant</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
