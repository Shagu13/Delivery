import { useState, useEffect, useCallback } from 'react';
import { getTenants } from '../../api/tenants';
import type { Tenant } from '../../api/tenants';
import { getTenantSettlement, recordTenantSettlementPayment } from '../../api/tenantSettlements';
import type { TenantSettlement } from '../../api/tenantSettlements';

const gel = (n: number) => `₾${n.toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Admin (dilo) side of the tenant ↔ company monthly settlement. Pick a tenant + month to
 * see what the company owes the tenant (COD) and what the tenant owes the company (service),
 * and record payments either way. The tenant co-admin sees these figures read-only.
 */
export default function AdminTenantSettlementsPage({ token }: { token: string }) {
  const now = new Date();
  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [tenantId, setTenantId]   = useState('');
  const [year, setYear]           = useState(now.getFullYear());
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [data, setData]           = useState<TenantSettlement | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [codInput, setCodInput]   = useState('');
  const [svcInput, setSvcInput]   = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    getTenants(token).then(ts => { setTenants(ts); if (ts.length && !tenantId) setTenantId(ts[0].id); }).catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = useCallback(() => {
    if (!tenantId) { setData(null); return; }
    setLoading(true); setError(null);
    getTenantSettlement(token, tenantId, year, month)
      .then(setData)
      .catch(() => setError('Failed to load settlement.'))
      .finally(() => setLoading(false));
  }, [token, tenantId, year, month]);

  useEffect(() => { load(); }, [load]);

  const pay = async (kind: 'cod' | 'service') => {
    const raw = kind === 'cod' ? codInput : svcInput;
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount <= 0) return;
    setSaving(true); setError(null);
    try {
      const updated = await recordTenantSettlementPayment(token, {
        tenantId, year, month,
        ...(kind === 'cod' ? { codPaidToTenant: amount } : { servicePaidByTenant: amount }),
      });
      setData(updated);
      if (kind === 'cod') setCodInput(''); else setSvcInput('');
    } catch {
      setError('Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const yearOpts = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const card = (label: string, value: string, accent: boolean) => (
    <div style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)',
      border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`,
      borderRadius: 10, padding: '14px 16px', minWidth: 170 }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', marginTop: 3 }}>{label}</div>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
    background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.88rem', width: 120,
  };
  const selStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
    background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.88rem',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Tenant Settlements</h2>
        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
          Settle COD the company collected for a tenant, and service fees the tenant owes the company.
        </p>
      </div>

      {tenants.length === 0 ? (
        <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>No tenants yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={selStyle}>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selStyle}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={selStyle}>
              {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

          {loading || !data ? (
            <div style={{ padding: 24, color: 'var(--color-text-subtle)' }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {card('Company owes tenant (COD)', gel(data.outstandingCodOwedToTenant), true)}
                {card('Tenant owes company (service)', gel(data.outstandingServiceOwedByTenant), false)}
                {card('Delivered orders', String(data.totalNumberOfOrderDelivered), false)}
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 4 }}>
                {/* Pay COD to tenant */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Pay COD to tenant</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                    Gross {gel(data.totalCODCompanyCollectedForTenant)} · Paid {gel(data.totalAmountOfCollectedCodPaidToTenant)}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={codInput} onChange={e => setCodInput(e.target.value)} style={inputStyle} />
                    <button className="btn-primary" disabled={saving || !codInput} onClick={() => pay('cod')} style={{ fontSize: '0.82rem' }}>Record</button>
                  </div>
                </div>

                {/* Record service from tenant */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Record service received from tenant</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                    Gross {gel(data.totalCompanyServicePriceOwedByTenant)} · Paid {gel(data.totalAmountPaidToCompanyForCompanyService)}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={svcInput} onChange={e => setSvcInput(e.target.value)} style={inputStyle} />
                    <button className="btn-primary" disabled={saving || !svcInput} onClick={() => pay('service')} style={{ fontSize: '0.82rem' }}>Record</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
