import { useCallback, useEffect, useState } from 'react';
import {
  type AdminCustomer,
  getCustomers,
  setCustomerCompanyPrice,
  setCustomerActive,
} from '../../api/customers';
import { AdminSetPasswordModal } from './AdminSetPasswordModal';
import { EditCustomerModal } from './EditCustomerModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  token: string;
}

interface EditState {
  capitalPrice:  string;
  cityPrice:     string;
  districtPrice: string;
  included:      boolean;
}

function priceDisplay(v: number | null, defaultLabel: string) {
  return v != null ? `₾${v}` : <em style={{ color: '#999' }}>{defaultLabel}</em>;
}

export default function AdminCustomersPage({ token }: Props) {
  const { t } = useLanguage();
  const [customers, setCustomers]       = useState<AdminCustomer[]>([]);
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [loading, setLoading]           = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editState, setEditState]       = useState<EditState>({ capitalPrice: '', cityPrice: '', districtPrice: '', included: false });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [pwdCustomer, setPwdCustomer]   = useState<AdminCustomer | null>(null);
  const [editCustomer, setEditCustomer] = useState<AdminCustomer | null>(null);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminCustomer | null>(null);
  const [notice, setNotice]             = useState('');

  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const result = await getCustomers(token, p, PAGE_SIZE, q);
      setCustomers(result.items as AdminCustomer[]);
      setTotalPages(result.totalPages || 1);
    } catch {
      setError(t.acupLoadFail);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(1, search); }, [search, load]);

  function startEdit(c: AdminCustomer) {
    setEditingId(c.id);
    setEditState({
      capitalPrice:  c.companyServiceCapitalPrice  != null ? String(c.companyServiceCapitalPrice)  : '',
      cityPrice:     c.companyServiceCityPrice     != null ? String(c.companyServiceCityPrice)     : '',
      districtPrice: c.companyServiceDistrictPrice != null ? String(c.companyServiceDistrictPrice) : '',
      included:      c.isCompanyServicePriceIncludedInPrice,
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const parse = (v: string) => v === '' ? null : Number(v);
      const prices = {
        capitalPrice:  parse(editState.capitalPrice),
        cityPrice:     parse(editState.cityPrice),
        districtPrice: parse(editState.districtPrice),
        isCompanyServicePriceIncludedInPrice: editState.included,
      };
      await setCustomerCompanyPrice(id, prices, token);
      setCustomers(prev => prev.map(c =>
        c.id === id ? {
          ...c,
          companyServiceCapitalPrice:  prices.capitalPrice,
          companyServiceCityPrice:     prices.cityPrice,
          companyServiceDistrictPrice: prices.districtPrice,
          isCompanyServicePriceIncludedInPrice: prices.isCompanyServicePriceIncludedInPrice,
        } : c
      ));
      setEditingId(null);
    } catch {
      setError(t.acupSaveFail);
    } finally {
      setSaving(false);
    }
  }

  // Deactivating needs confirmation (it blocks login); reactivating is immediate.
  function onToggleClick(c: AdminCustomer) {
    if (c.isActive) setDeactivateTarget(c);
    else void applyActive(c, true);
  }

  async function applyActive(c: AdminCustomer, next: boolean) {
    setTogglingId(c.id);
    setError('');
    try {
      await setCustomerActive(c.id, next, token);
      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, isActive: next } : x));
      setDeactivateTarget(null);
    } catch {
      setError(t.acupActiveFail);
    } finally {
      setTogglingId(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: 80, padding: '0.25rem', borderRadius: 6,
    border: '1px solid #ccc', fontSize: '0.82rem',
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>{t.acupTitle}</h2>

      <input
        type="text"
        placeholder={t.acupSearchPh}
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{
          padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #ddd',
          width: '100%', maxWidth: 400, marginBottom: '1rem', fontSize: '0.9rem',
        }}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {notice && <p style={{ color: '#15803d' }}>{notice}</p>}

      {loading ? (
        <p>{t.loading}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {[
                t.acupThBusiness, t.acupThName, t.acupThPhone, t.acupThCity, t.acupThDistrict, t.acupThAddress, t.acupThEmail, t.acupThActive,
                t.acupThCapital, t.acupThCityPrice, t.acupThDistrictPrice, t.acupThIncluded, t.acupThActions,
              ].map((h, i) => (
                <th key={i} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.businessName}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.firstName} {c.lastName}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.phoneNumber}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.city}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.district}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.address}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.email}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.isActive ? t.acupActive : t.acupInactive}</td>

                {editingId === c.id ? (
                  <>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number" style={inputStyle} value={editState.capitalPrice}
                        placeholder="null"
                        onChange={e => setEditState(s => ({ ...s, capitalPrice: e.target.value }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number" style={inputStyle} value={editState.cityPrice}
                        placeholder="null"
                        onChange={e => setEditState(s => ({ ...s, cityPrice: e.target.value }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number" style={inputStyle} value={editState.districtPrice}
                        placeholder="null"
                        onChange={e => setEditState(s => ({ ...s, districtPrice: e.target.value }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={editState.included}
                        onChange={e => setEditState(s => ({ ...s, included: e.target.checked }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                            onClick={() => saveEdit(c.id)} disabled={saving}
                            style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                          >{t.save}</button>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}
                          >✕</button>
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{priceDisplay(c.companyServiceCapitalPrice, t.acupDefault)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{priceDisplay(c.companyServiceCityPrice, t.acupDefault)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{priceDisplay(c.companyServiceDistrictPrice, t.acupDefault)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      {c.isCompanyServicePriceIncludedInPrice ? t.acupYes : t.acupNo}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setEditCustomer(c)}
                          style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', cursor: 'pointer', fontSize: '0.8rem' }}
                        >{t.edit}</button>
                        <button
                          onClick={() => startEdit(c)}
                          style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#f3f4f6', border: '1px solid #ddd', cursor: 'pointer', fontSize: '0.8rem' }}
                        >{t.acupPricesBtn}</button>
                        <button
                          onClick={() => setPwdCustomer(c)}
                          style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#f3f4f6', border: '1px solid #ddd', cursor: 'pointer', fontSize: '0.8rem' }}
                        >{t.acupSetPwd}</button>
                        <button
                          onClick={() => onToggleClick(c)}
                          disabled={togglingId === c.id}
                          style={{
                            padding: '0.2rem 0.5rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
                            border: '1px solid ' + (c.isActive ? '#fca5a5' : '#86efac'),
                            background: c.isActive ? '#fef2f2' : '#f0fdf4',
                            color: c.isActive ? '#b91c1c' : '#15803d',
                          }}
                        >{c.isActive ? t.acupDeactivate : t.acupActivate}</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1rem', alignItems: 'center' }}>
        <button
          disabled={page <= 1}
          onClick={() => { const p = page - 1; setPage(p); void load(p, search); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}
        >{t.acupPrev}</button>
        <span>{t.acupPage(page, totalPages)}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => { const p = page + 1; setPage(p); void load(p, search); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}
        >Next →</button>
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
          setCustomers(prev => prev.map(x => x.id === editCustomer?.id ? { ...x, ...patch } : x));
          setEditCustomer(null);
          setNotice(t.acupEditSuccess);
        }}
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
