import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { createCustomer, CustomerApiError } from '../../api/customers';
import type { CreateCustomerResponse } from '../../api/customers';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  open: boolean; onClose: () => void; onCreated: (customer: CreateCustomerResponse) => void;
}
interface FormState {
  firstName: string; lastName: string; idNumber: string; businessName: string;
  phoneNumber: string; city: string; district: string; address: string;
  email: string; password: string;
}
const EMPTY: FormState = { firstName: '', lastName: '', idNumber: '', businessName: '', phoneNumber: '', city: '', district: '', address: '', email: '', password: '' };

export function CreateCustomerModal({ open, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [form,     setForm]     = useState<FormState>(EMPTY);
  const [errors,   setErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [priceIncluded, setPriceIncluded] = useState(false);

  useEffect(() => { if (open) { setForm(EMPTY); setErrors({}); setApiError(null); setPriceIncluded(false); } }, [open]);

  if (!open) return null;

    const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }));
        setErrors(prev => ({ ...prev, [field]: undefined }));
        setApiError(null);
    };
  const setDirect = (field: 'city' | 'district') => (value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
    setApiError(null);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim())    e.firstName    = t.errFirstNameRequired;
    if (!form.lastName.trim())     e.lastName     = t.errLastNameRequired;
    if (!form.businessName.trim()) e.businessName = t.errBusinessNameRequired;
    if (!form.phoneNumber.trim())  e.phoneNumber  = t.errPhoneRequired;
    if (!form.city.trim())         e.city         = t.errCityRequired;
    if (!form.district.trim())     e.district     = t.errDistrictRequired;
    if (!form.address.trim())      e.address      = t.errAddressRequired;
    if (!form.email.trim())        e.email        = t.errEmailRequired;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = t.errEmailInvalid;
    // Mirror ASP.NET Identity's password policy so unmet rules surface as clear
    // warnings here instead of an opaque server error: min 8, upper, lower, digit.
    if (!form.password)                        e.password = t.errPasswordRequired;
    else if (form.password.length < 8)         e.password = t.errPasswordShort;
    else if (!/[A-Z]/.test(form.password))     e.password = t.errPasswordUppercase;
    else if (!/[a-z]/.test(form.password))     e.password = t.errPasswordLowercase;
    else if (!/[0-9]/.test(form.password))     e.password = t.errPasswordNumber;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setLoading(true);
    try {
      const result = await createCustomer({ ...form, idNumber: form.idNumber.trim() || undefined, isCompanyServicePriceIncludedInPrice: priceIncluded }, token);
      setForm(EMPTY);
      onCreated(result);
    } catch (err) {
      if (err instanceof CustomerApiError && err.errors) {
        // Map field-level errors from the API onto the form fields so they appear
        // inline (e.g. duplicate phone/email → red hint under the matching input).
        const fieldMap: Partial<Record<keyof FormState, string>> = {};
        for (const [key, messages] of Object.entries(err.errors)) {
          const field = (key.charAt(0).toLowerCase() + key.slice(1)) as keyof FormState;
          if (field in EMPTY) fieldMap[field] = messages[0];
        }
        if (Object.keys(fieldMap).length > 0) {
          setErrors(prev => ({ ...prev, ...fieldMap }));
        } else {
          setApiError(err.message);
        }
      } else {
        setApiError(err instanceof CustomerApiError ? err.message : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">{t.customerModalTitle}</span>
          <button className="modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal__body">
          <p className="modal__section-label">{t.customerPersonalSection}</p>
          <div className="form-row">
            <FormField label={t.firstName} value={form.firstName} onChange={set('firstName')} error={errors.firstName} placeholder={t.phFirstName} />
            <FormField label={t.lastName}  value={form.lastName}  onChange={set('lastName')}  error={errors.lastName}  placeholder={t.phLastName} />
          </div>
          <FormField label={t.businessName} value={form.businessName} onChange={set('businessName')} error={errors.businessName} placeholder={t.phBusinessName} />
          <div className="form-row">
            <FormField label={t.idNumber}    value={form.idNumber}    onChange={set('idNumber')}    error={errors.idNumber}    placeholder={t.phIdNumber} />
            <FormField label={t.phoneNumber} value={form.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber} placeholder={t.phPhone} />
          </div>

          <div className="modal__divider" />

          <p className="modal__section-label">{t.customerPickupSection}</p>
          <CityDistrictPicker
            cityValue={form.city} districtValue={form.district}
            onCityChange={setDirect('city')} onDistrictChange={setDirect('district')}
            cityError={errors.city} districtError={errors.district}
          />
          <FormField label={t.streetAddress} value={form.address} onChange={set('address')} error={errors.address} placeholder={t.phStreetAddress} />

          <div className="modal__divider" />

          <p className="modal__section-label">{t.customerCredSection}</p>
          <FormField label={t.emailAddress} type="email"    value={form.email}    onChange={set('email')}    error={errors.email}    placeholder={t.phEmail} />
          <FormField label={t.password}     type="password" value={form.password} onChange={set('password')} error={errors.password} placeholder={t.phPassword} />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 12 }}>
            <input type="checkbox" checked={priceIncluded} onChange={e => setPriceIncluded(e.target.checked)} />
            <span style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
              {t.cgoServiceIncluded}
              <br />
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.cgoServiceIncludedHint}</span>
            </span>
          </label>

          {apiError && <div className="form-error-banner" role="alert">{apiError}</div>}
        </div>

        <div className="modal__footer">
          <button className="btn-ghost"   onClick={onClose}      disabled={loading}>{t.cancel}</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t.customerSubmitting : t.customerSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
