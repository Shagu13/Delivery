import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { getTenantOrders, acceptTenantOrder } from '../../api/tenantOrders';
import type { TenantGroupOrder } from '../../api/tenantOrders';
import { getTenantFinanceOverview } from '../../api/tenantFinance';
import type { TenantFinanceOverview } from '../../api/tenantFinance';
import { TenantSettlementPanel } from './TenantSettlementPanel';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import '../../styles/dashboard.css';

/**
 * Co-admin (TenantAdmin) dashboard. Phase 3: scoped order list + accept action.
 * Courier assignment / pricing / warehouse stay Admin-only; finance arrives in Phase 4.
 */
export function TenantDashboard() {
  const { user, token, signOut } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();

  const [orders,  setOrders]  = useState<TenantGroupOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [finance, setFinance] = useState<TenantFinanceOverview | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true); setError(null);
    getTenantOrders(token)
      .then(data => { setOrders(data); setLoading(false); })
      .catch(() => { setError(t.tenantOrdersError); setLoading(false); });
    getTenantFinanceOverview(token).then(setFinance).catch(() => setFinance(null));
  }, [token, t.tenantOrdersError]);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };

  const handleAccept = async (id: string) => {
    if (!token) return;
    setAcceptingId(id);
    try {
      await acceptTenantOrder(id, token);
      load();
    } catch {
      setError(t.tenantOrdersError);
    } finally {
      setAcceptingId(null);
    }
  };

  const cityName = (en: string, geo?: string) => (lang === 'ka' && geo ? geo : en);
  const gel = (n: number) => `₾${n.toFixed(2)}`;

  return (
    <div className="dashboard__section" style={{ maxWidth: 980, margin: '32px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <h2 className="dashboard__title" style={{ margin: 0 }}>{t.tenantDashTitle}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>
            {t.tenantDashWelcome}, {user?.firstName} {user?.lastName}
          </span>
          <LanguageToggle />
          <button className="btn-ghost" onClick={handleSignOut}>{t.signOut}</button>
        </div>
      </div>

      {/* Finance — live balances (read-only) */}
      {finance && (
        <div className="content-card" style={{ marginBottom: 16 }}>
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

      {/* Sub-customer settlements */}
      <TenantSettlementPanel />

      <div className="content-card">
        <div className="content-card__header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="content-card__title">{t.tenantOrdersTitle}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{t.tenantOrdersHint}</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
            <div className="go-spinner" style={{ margin: '0 auto 8px' }} />
          </div>
        ) : error ? (
          <div style={{ padding: 16, color: '#ef4444' }}>{error} <button className="btn-ghost btn-ghost--sm" onClick={load}>↻</button></div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)' }}>{t.tenantNoOrders}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {[t.tenantColBusiness, t.tenantColPackages, t.tenantColPickup, t.tenantColStatus, t.tenantColCreated, t.tenantColAction].map((h, i) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: i === 5 ? 'right' : 'left', fontWeight: 600,
                      fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(go => {
                  const meta = getStatusMeta(go.status, lang);
                  const [bg, fg] = STATUS_COLORS[go.status] ?? ['var(--color-bg-3)', 'var(--color-text-subtle)'];
                  const canAccept = go.status === 'Pending';
                  return (
                    <tr key={go.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{go.senderBusinessName}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--color-text-subtle)' }}>{go.numberOfPackages}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--color-text-subtle)' }}>
                        {cityName(go.pickUpCity, go.pickUpCityGeo)}, {cityName(go.pickUpDistrict, go.pickUpDistrictGeo)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span title={meta.description} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: bg, color: fg }}>
                          {meta.short}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>
                        {new Date(go.createdAt).toLocaleDateString(lang === 'ka' ? 'ka-GE' : 'en-GB')}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {canAccept && (
                          <button
                            className="btn-primary"
                            style={{ fontSize: '0.78rem', padding: '5px 14px' }}
                            disabled={acceptingId === go.id}
                            onClick={() => handleAccept(go.id)}
                          >
                            {acceptingId === go.id ? t.tenantAccepting : t.tenantAccept}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 16 }}>
        {t.tenantDashComingSoon}
      </p>
    </div>
  );
}
