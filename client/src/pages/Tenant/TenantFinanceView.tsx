import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { getTenantFinanceOverview } from '../../api/tenantFinance';
import type { TenantFinanceOverview } from '../../api/tenantFinance';
import { TenantSettlementPanel } from './TenantSettlementPanel';

const gel = (n: number) => `₾${n.toFixed(2)}`;

/**
 * The co-admin Finance page (rendered inside AdminDashboard for TenantAdmin). Reuses the
 * scoped, verified tenant finance components — the four live balances + the sub-customer
 * settlement panel. Deliberately NOT the admin AdminFinancePage, which shows company-wide P&L.
 */
export function TenantFinanceView() {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [finance, setFinance] = useState<TenantFinanceOverview | null>(null);

  useEffect(() => {
    if (token) getTenantFinanceOverview(token).then(setFinance).catch(() => setFinance(null));
  }, [token]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      {finance && (
        <div className="content-card">
          <div className="content-card__header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span className="content-card__title">{t.tenantFinTitle}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{t.tenantFinHint}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, padding: 16 }}>
            {([
              { label: t.tenantFinOwesCompany,   value: finance.tenantOwesCompany,   accent: true  },
              { label: t.tenantFinCompanyOwes,   value: finance.companyOwesTenant,   accent: false },
              { label: t.tenantFinOwesCustomers, value: finance.tenantOwesCustomers, accent: false },
              { label: t.tenantFinCustomersOwe,  value: finance.customersOweTenant,  accent: false },
            ]).map(({ label, value, accent }) => (
              <div key={label} style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)',
                border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`,
                borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{gel(value)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <TenantSettlementPanel />
    </div>
  );
}
