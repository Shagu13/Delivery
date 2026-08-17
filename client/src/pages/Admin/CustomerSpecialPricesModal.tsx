import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { FormField } from '../../components/ui/FormField';
import type { District } from '../../api/cities';
import {
  getCustomerSpecialPrices,
  setCustomerSpecialPrice,
  deleteCustomerSpecialPrice,
  CustomerApiError,
} from '../../api/customers';
import type { AdminCustomer, CustomerSpecialPrice } from '../../api/customers';
import { useLanguage } from '../../contexts/useLanguage';
import '../../components/ui/Modal.css';

interface Props {
  customer: AdminCustomer | null;
  onClose: () => void;
}

/**
 * Admin management of a customer's per-district negotiated price exceptions — sparse
 * overrides on top of their capital/city/district tiers (e.g. a special Rustavi rate).
 * Add/remove apply immediately; there is no separate Save step.
 */
export function CustomerSpecialPricesModal({ customer, onClose }: Props) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();

  const [rows,    setRows]    = useState<CustomerSpecialPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [cityValue,     setCityValue]     = useState('');
  const [districtValue, setDistrictValue] = useState('');
  const [district,      setDistrict]      = useState<District | null>(null);
  const [price,         setPrice]         = useState('');
  const [formError,     setFormError]     = useState<string | null>(null);
  const [adding,        setAdding]        = useState(false);
  const [removingId,    setRemovingId]    = useState<string | null>(null);

  useEffect(() => {
    if (!customer || !token) return;
    setLoading(true);
    setError(null);
    getCustomerSpecialPrices(customer.id, token)
      .then(setRows)
      .catch(() => setError(t.cspLoadFail))
      .finally(() => setLoading(false));
    setCityValue(''); setDistrictValue(''); setDistrict(null); setPrice(''); setFormError(null);
  }, [customer, token, t.cspLoadFail]);

  if (!customer) return null;

  const districtLabel = (d: CustomerSpecialPrice) =>
    lang === 'ka' && d.districtNameGeo ? d.districtNameGeo : d.districtName;

  async function handleAdd() {
    if (!token || !customer) return;
    if (!district) { setFormError(t.cspSelectDistrictFirst); return; }
    const parsed = Number(price);
    if (price.trim() === '' || Number.isNaN(parsed) || parsed < 0) { setFormError(t.cspInvalidPrice); return; }

    setFormError(null);
    setAdding(true);
    try {
      const fresh = await setCustomerSpecialPrice(customer.id, district.id, parsed, token);
      setRows(fresh);
      setCityValue(''); setDistrictValue(''); setDistrict(null); setPrice('');
    } catch (err) {
      setFormError(err instanceof CustomerApiError ? err.message : t.cspSaveFail);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(row: CustomerSpecialPrice) {
    if (!token || !customer) return;
    setRemovingId(row.id);
    setError(null);
    try {
      const fresh = await deleteCustomerSpecialPrice(customer.id, row.id, token);
      setRows(fresh);
    } catch {
      setError(t.cspDeleteFail);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.cspTitle(customer.businessName)}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p className="ui-modal__message" style={{ marginBottom: 14 }}>{t.cspIntro}</p>

          {loading ? (
            <p>{t.loading}</p>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.86rem' }}>{t.cspEmpty}</p>
          ) : (
            // A row list rather than a <table> — a table's columns don't shrink to fit a
            // 440px-wide modal (long Georgian district/city names forced horizontal
            // scroll); flex rows with truncating text never overflow their container.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
              {rows.map(row => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '8px 10px', background: 'var(--color-bg-3)', borderRadius: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: '0.86rem', color: 'var(--color-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {districtLabel(row)}
                    </div>
                    <div style={{
                      fontSize: '0.76rem', color: 'var(--color-text-subtle)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {row.cityName}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)' }}>
                      ₾{row.price}
                    </span>
                    <button
                      onClick={() => handleRemove(row)}
                      disabled={removingId === row.id}
                      aria-label={t.cspRemoveLabel}
                      style={{
                        padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem',
                        border: '1px solid var(--color-error)', background: 'var(--color-error-bg)', color: 'var(--color-error)',
                      }}
                    >
                      {removingId === row.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <div className="ui-modal__error" role="alert">{error}</div>}

          <div className="ui-modal__divider" />
          <p className="ui-modal__section-label">{t.cspAddSectionLabel}</p>

          <CityDistrictPicker
            cityValue={cityValue} districtValue={districtValue}
            onCityChange={setCityValue}
            onDistrictChange={setDistrictValue}
            onDistrictSelect={d => { setDistrict(d); setFormError(null); }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <FormField
                label={t.cspPriceCol}
                type="number" min={0} step="0.01"
                placeholder={t.cspPricePh}
                value={price}
                onChange={e => { setPrice(e.target.value); setFormError(null); }}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="ui-modal__btn ui-modal__btn--primary"
              style={{ marginBottom: 2 }}
            >
              {adding ? t.cspAdding : t.cspAddBtn}
            </button>
          </div>
          {formError && <div className="ui-modal__error" role="alert">{formError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
