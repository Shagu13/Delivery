import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { setCustomerCompanyPrice, CustomerApiError } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import { useLanguage } from '../../contexts/useLanguage';
import '../../components/ui/Modal.css';

interface Props {
  customer: AdminCustomer | null;
  onClose: () => void;
  onSaved: (patch: Pick<AdminCustomer,
    'companyServiceCapitalPrice' | 'companyServiceCityPrice' | 'companyServiceDistrictPrice' | 'isCompanyServicePriceIncludedInPrice'>) => void;
}

/** Admin edit of a customer's negotiated capital/city/district delivery-fee tiers. */
export function EditCompanyPriceModal({ customer, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [capitalPrice,  setCapitalPrice]  = useState('');
  const [cityPrice,     setCityPrice]     = useState('');
  const [districtPrice, setDistrictPrice] = useState('');
  const [included,      setIncluded]      = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!customer) return;
    setCapitalPrice(customer.companyServiceCapitalPrice   != null ? String(customer.companyServiceCapitalPrice)  : '');
    setCityPrice(customer.companyServiceCityPrice          != null ? String(customer.companyServiceCityPrice)     : '');
    setDistrictPrice(customer.companyServiceDistrictPrice  != null ? String(customer.companyServiceDistrictPrice) : '');
    setIncluded(customer.isCompanyServicePriceIncludedInPrice);
    setApiError(null);
  }, [customer]);

  if (!customer) return null;

  const parse = (v: string) => v.trim() === '' ? null : Number(v);

  async function handleSubmit() {
    if (!token || !customer) return;
    setLoading(true);
    setApiError(null);
    try {
      const patch = {
        capitalPrice:  parse(capitalPrice),
        cityPrice:     parse(cityPrice),
        districtPrice: parse(districtPrice),
        isCompanyServicePriceIncludedInPrice: included,
      };
      await setCustomerCompanyPrice(customer.id, patch, token);
      onSaved({
        companyServiceCapitalPrice:  patch.capitalPrice,
        companyServiceCityPrice:     patch.cityPrice,
        companyServiceDistrictPrice: patch.districtPrice,
        isCompanyServicePriceIncludedInPrice: patch.isCompanyServicePriceIncludedInPrice,
      });
    } catch (err) {
      setApiError(err instanceof CustomerApiError ? err.message : t.acupSaveFail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.acupPriceModalTitle(customer.businessName)}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p className="ui-modal__message" style={{ marginBottom: 14 }}>{t.acupPriceModalIntro}</p>

          <div className="ui-modal__row">
            <FormField label={t.acupThCapital} type="number" min={0} step="0.01" placeholder={t.acupDefault}
              value={capitalPrice} onChange={e => setCapitalPrice(e.target.value)} />
            <FormField label={t.acupThCityPrice} type="number" min={0} step="0.01" placeholder={t.acupDefault}
              value={cityPrice} onChange={e => setCityPrice(e.target.value)} />
          </div>
          <FormField label={t.acupThDistrictPrice} type="number" min={0} step="0.01" placeholder={t.acupDefault}
            value={districtPrice} onChange={e => setDistrictPrice(e.target.value)} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: '0.86rem', color: 'var(--color-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={included} onChange={e => setIncluded(e.target.checked)} />
            {t.acupThIncluded}
          </label>

          {apiError && <div className="ui-modal__error" role="alert">{apiError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose} disabled={loading}>{t.cancel}</button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t.customerSubmitting : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
