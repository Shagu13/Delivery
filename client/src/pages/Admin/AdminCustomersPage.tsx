import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  type AdminCustomer,
  getCustomers,
  setCustomerActive,
} from '../../api/customers';
import type { PagedResult } from '../../types/paging';
import { AdminSetPasswordModal } from './AdminSetPasswordModal';
import { EditCustomerModal } from './EditCustomerModal';
import { EditCompanyPriceModal } from './EditCompanyPriceModal';
import { CustomerSpecialPricesModal } from './CustomerSpecialPricesModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RowActionsMenu, type RowActionItem } from '../../components/ui/RowActionsMenu';
import { useLanguage } from '../../contexts/useLanguage';
import './AdminCustomersPage.css';

interface Props {
  token: string;
  /** Admin caps. When false (tenant co-admin): hide pricing, password reset, deactivate. */
  canManage?: boolean;
}

const PAGE_SIZE = 20;

function initials(businessName: string): string {
  const trimmed = businessName.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  return parts.length === 1
    ? trimmed.slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[1][0]).toUpperCase();
}

function PricingPills({ c }: { c: AdminCustomer }) {
  const { t } = useLanguage();
  const pill = (set: boolean, label: string, value: number | null) => (
    <span className={`acp-price-pill${set ? ' acp-price-pill--set' : ''}`}>
      {label}{set ? ` ₾${value}` : ''}
    </span>
  );
  return (
    <div className="acp-price-pills">
      {pill(c.companyServiceCapitalPrice  != null, t.acupPillCapital,  c.companyServiceCapitalPrice)}
      {pill(c.companyServiceCityPrice     != null, t.acupPillCity,     c.companyServiceCityPrice)}
      {pill(c.companyServiceDistrictPrice != null, t.acupPillDistrict, c.companyServiceDistrictPrice)}
    </div>
  );
}

export default function AdminCustomersPage({ token, canManage = true }: Props) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch]             = useState('');
  // Refetch 300ms after the admin stops typing instead of on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [page, setPage]                 = useState(1);
  const [actionError, setActionError]   = useState('');
  const [pwdCustomer, setPwdCustomer]   = useState<AdminCustomer | null>(null);
  const [editCustomer, setEditCustomer] = useState<AdminCustomer | null>(null);
  const [priceCustomer, setPriceCustomer] = useState<AdminCustomer | null>(null);
  const [specialPricesCustomer, setSpecialPricesCustomer] = useState<AdminCustomer | null>(null);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminCustomer | null>(null);
  const [notice, setNotice]             = useState('');

  // Reset to page 1 whenever the (debounced) search term changes.
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const queryKey = ['admin', 'customers', 'list', debouncedSearch, page] as const;
  const customersQuery = useQuery({
    queryKey,
    queryFn: () => getCustomers(token, page, PAGE_SIZE, debouncedSearch),
    enabled: !!token,
    placeholderData: keepPreviousData,
  });
  const customers  = customersQuery.data?.items ?? [];
  const totalPages = customersQuery.data?.totalPages || 1;
  const loading    = customersQuery.isPending;
  const error      = actionError || (customersQuery.isError ? t.acupLoadFail : '');

  // Apply a mutation's known effect to the loaded page immediately, without waiting for
  // a full refetch.
  const patchCustomer = (id: string, patch: (c: AdminCustomer) => AdminCustomer) => {
    queryClient.setQueryData(queryKey, (prev: PagedResult<AdminCustomer> | undefined) =>
      prev ? { ...prev, items: prev.items.map(c => c.id === id ? patch(c) : c) } : prev);
  };

  // Deactivating needs confirmation (it blocks login); reactivating is immediate.
  function onToggleClick(c: AdminCustomer) {
    if (c.isActive) setDeactivateTarget(c);
    else void applyActive(c, true);
  }

  async function applyActive(c: AdminCustomer, next: boolean) {
    setTogglingId(c.id);
    setActionError('');
    try {
      await setCustomerActive(c.id, next, token);
      patchCustomer(c.id, x => ({ ...x, isActive: next }));
      setDeactivateTarget(null);
    } catch {
      setActionError(t.acupActiveFail);
    } finally {
      setTogglingId(null);
    }
  }

  function rowActions(c: AdminCustomer): RowActionItem[] {
    const items: RowActionItem[] = [
      { label: t.edit, onClick: () => setEditCustomer(c) },
    ];
    if (canManage) {
      items.push(
        { label: t.acupPricesBtn, onClick: () => setPriceCustomer(c) },
        { label: t.acupSpecialPricesBtn, onClick: () => setSpecialPricesCustomer(c) },
        { label: t.acupSetPwd, onClick: () => setPwdCustomer(c) },
        {
          label: c.isActive ? t.acupDeactivate : t.acupActivate,
          onClick: () => onToggleClick(c),
          disabled: togglingId === c.id,
          danger: c.isActive,
        },
      );
    }
    return items;
  }

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 1.5rem)' }}>
      <h2 style={{ marginBottom: '1rem' }}>{t.acupTitle}</h2>

      <input
        type="text"
        placeholder={t.acupSearchPh}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)',
          width: '100%', maxWidth: 400, marginBottom: '1rem', fontSize: '0.9rem',
        }}
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}
      {notice && <p style={{ color: 'var(--color-success)' }}>{notice}</p>}

      {loading ? (
        <p>{t.loading}</p>
      ) : customers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__text">{t.acupNoResults}</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet: dense data grid */}
          <div className="table-scroll acp-table-wrap">
            <table className="acp-table">
              <thead>
                <tr>
                  <th>{t.acupThBusiness}</th>
                  <th>{t.acupThContact}</th>
                  <th>{t.acupThLocation}</th>
                  <th>{t.acupThStatus}</th>
                  {canManage && <th>{t.acupThPricing}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="acp-business-cell">
                        <div className="acp-avatar">{initials(c.businessName)}</div>
                        <div>
                          <div className="acp-primary">{c.businessName}</div>
                          <div className="acp-secondary">{c.firstName} {c.lastName}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="acp-primary">{c.phoneNumber}</div>
                      <div className="acp-secondary">{c.email}</div>
                    </td>
                    <td>
                      <div className="acp-primary">{c.city}</div>
                      <div className="acp-secondary">{c.district}</div>
                    </td>
                    <td>
                      <span className={`acp-badge ${c.isActive ? 'acp-badge--active' : 'acp-badge--inactive'}`}>
                        {c.isActive ? t.acupActive : t.acupInactive}
                      </span>
                    </td>
                    {canManage && (
                      <td><PricingPills c={c} /></td>
                    )}
                    <td>
                      <RowActionsMenu items={rowActions(c)} label={t.acupActionsLabel(c.businessName)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone-width: card list */}
          <div className="acp-cards">
            {customers.map(c => (
              <div className="acp-card" key={c.id}>
                <div className="acp-card__head">
                  <div className="acp-card__id">
                    <div className="acp-avatar">{initials(c.businessName)}</div>
                    <div className="acp-card__name">
                      <div className="acp-card__business">{c.businessName}</div>
                      <div className="acp-card__person">{c.firstName} {c.lastName}</div>
                    </div>
                  </div>
                  <span className={`acp-badge ${c.isActive ? 'acp-badge--active' : 'acp-badge--inactive'}`}>
                    {c.isActive ? t.acupActive : t.acupInactive}
                  </span>
                </div>

                <div className="acp-card__rows">
                  <div className="acp-card__row">
                    <span className="acp-card__row-label">{t.phoneNumber}</span>
                    <span className="acp-card__row-value">{c.phoneNumber}</span>
                  </div>
                  <div className="acp-card__row">
                    <span className="acp-card__row-label">{t.emailAddress}</span>
                    <span className="acp-card__row-value">{c.email}</span>
                  </div>
                  <div className="acp-card__row">
                    <span className="acp-card__row-label">{t.city} / {t.district}</span>
                    <span className="acp-card__row-value">{c.city}, {c.district}</span>
                  </div>
                  {canManage && (
                    <div className="acp-card__row">
                      <span className="acp-card__row-label">{t.acupThPricing}</span>
                      <span className="acp-card__row-value"><PricingPills c={c} /></span>
                    </div>
                  )}
                </div>

                <div className="acp-card__footer">
                  <button
                    onClick={() => setEditCustomer(c)}
                    style={{ padding: '0.3rem 0.7rem', borderRadius: 6, background: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                  >{t.edit}</button>
                  <RowActionsMenu items={rowActions(c)} label={t.acupActionsLabel(c.businessName)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1rem', alignItems: 'center' }}>
        <button
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer' }}
        >{t.acupPrev}</button>
        <span>{t.acupPage(page, totalPages)}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer' }}
        >{t.acupNext}</button>
      </div>

      <AdminSetPasswordModal
        customer={pwdCustomer}
        onClose={() => setPwdCustomer(null)}
        onDone={() => { setPwdCustomer(null); setNotice(t.acupSetPwdSuccess); }}
      />

      <EditCustomerModal
        customer={editCustomer}
        onClose={() => setEditCustomer(null)}
        onSaved={patch => {
          if (editCustomer) patchCustomer(editCustomer.id, x => ({ ...x, ...patch }));
          setEditCustomer(null);
          setNotice(t.acupEditSuccess);
        }}
      />

      <EditCompanyPriceModal
        customer={priceCustomer}
        onClose={() => setPriceCustomer(null)}
        onSaved={patch => {
          if (priceCustomer) patchCustomer(priceCustomer.id, x => ({ ...x, ...patch }));
          setPriceCustomer(null);
        }}
      />

      <CustomerSpecialPricesModal
        customer={specialPricesCustomer}
        onClose={() => setSpecialPricesCustomer(null)}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t.acupDeactivate}
        message={deactivateTarget ? t.acupConfirmDeactivate(`${deactivateTarget.firstName} ${deactivateTarget.lastName}`) : ''}
        confirmLabel={t.acupDeactivate}
        variant="danger"
        loading={togglingId !== null}
        onConfirm={() => { if (deactivateTarget) void applyActive(deactivateTarget, false); }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
