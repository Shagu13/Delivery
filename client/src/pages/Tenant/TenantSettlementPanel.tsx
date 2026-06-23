import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import {
  getTenantCustomers, getTenantCustomerOrders, setTenantOrderPayment,
} from '../../api/tenantFinance';
import type { TenantCustomer } from '../../api/tenantFinance';
import type { OrderFinanceLine } from '../../api/orderFinance';

const gel = (n: number) => `₾${n.toFixed(2)}`;

/**
 * Co-admin sub-customer settlement: pick one of the tenant's customers, see their order
 * lines, and record COD payouts / service-fee collection. Reuses the company per-order
 * payment mechanism, scoped server-side to the tenant.
 */
export function TenantSettlementPanel() {
  const { token } = useAuth();
  const { t } = useLanguage();

  const [customers,  setCustomers]  = useState<TenantCustomer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lines,      setLines]      = useState<OrderFinanceLine[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [busyId,     setBusyId]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getTenantCustomers(token).then(setCustomers).catch(() => setCustomers([]));
  }, [token]);

  const loadLines = useCallback(() => {
    if (!token || !customerId) { setLines([]); return; }
    setLoading(true);
    getTenantCustomerOrders(token, customerId)
      .then(setLines)
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [token, customerId]);

  useEffect(() => { loadLines(); }, [loadLines]);

  const toggle = async (line: OrderFinanceLine, which: 'cod' | 'service') => {
    if (!token) return;
    setBusyId(line.orderId);
    try {
      if (which === 'cod') {
        await setTenantOrderPayment(token, { orderId: line.orderId, codPaid: !line.isCollectedCodPaidToCustomer });
      } else {
        await setTenantOrderPayment(token, { orderId: line.orderId, servicePaid: line.companyServicePaymentStatus !== 'Paid' });
      }
      loadLines();
    } catch { /* surfaced by reload returning stale state */ } finally {
      setBusyId(null);
    }
  };

  const cellTh: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem',
    letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-subtle)',
  };

  return (
    <div className="content-card" style={{ marginBottom: 16 }}>
      <div className="content-card__header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <span className="content-card__title">{t.tenantSettleTitle}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{t.tenantSettleHint}</span>
      </div>

      <div style={{ padding: 16 }}>
        <select
          value={customerId}
          onChange={e => setCustomerId(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.88rem', minWidth: 240, marginBottom: 14 }}
        >
          <option value="">{t.tenantSettlePick}</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
        </select>

        {customerId && (loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
            <div className="go-spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : lines.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>{t.tenantSettleNoOrders}</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-2)' }}>
                  <th style={cellTh}>{t.ofinColTracking}</th>
                  <th style={cellTh}>{t.ofinColRecipient}</th>
                  <th style={{ ...cellTh, textAlign: 'right' }}>{t.ofinColCod}</th>
                  <th style={{ ...cellTh, textAlign: 'right' }}>{t.ofinColService}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const cod = line.codAmount ?? 0;
                  const hasCod = cod > 0.005;
                  const codPaid = line.isCollectedCodPaidToCustomer;
                  const senderPays = line.whoPaysForCompanyService === 'Sender';
                  const servicePaid = line.companyServicePaymentStatus === 'Paid';
                  const busy = busyId === line.orderId;
                  return (
                    <tr key={line.orderId} style={{ background: i % 2 ? 'var(--color-bg)' : 'var(--color-bg-2)', borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{line.trackingNumber}</td>
                      <td style={{ padding: '8px 12px' }}>{recipientDisplayName(line.recipientName, t.recipientUnknown)}</td>
                      {/* COD — company/livo owes customer */}
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <span style={{ fontWeight: 700 }}>{gel(cod)}</span>
                          {hasCod && (
                            <button className="btn-ghost btn-ghost--sm" disabled={busy} onClick={() => toggle(line, 'cod')}
                              style={{ color: codPaid ? '#059669' : 'var(--color-accent)' }}>
                              {codPaid ? `${t.ofinPaid} · ${t.tenantUndo}` : t.tenantMarkPaid}
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Service fee — customer owes livo (sender-pays only) */}
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <span style={{ fontWeight: 700 }}>{gel(line.companyServicePrice)}</span>
                          {senderPays ? (
                            <button className="btn-ghost btn-ghost--sm" disabled={busy} onClick={() => toggle(line, 'service')}
                              style={{ color: servicePaid ? '#059669' : 'var(--color-accent)' }}>
                              {servicePaid ? `${t.ofinPaid} · ${t.tenantUndo}` : t.tenantMarkPaid}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>{t.ofinRecipientPays}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
