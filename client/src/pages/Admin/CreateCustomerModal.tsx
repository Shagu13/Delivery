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

  useEffect(() => { if (open) { setForm(EMPTY); setErrors({}); setApiError(null); } }, [open]);

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
    if (form.password.length < 8)  e.password     = t.errPasswordShort;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setLoading(true);
    try {
      const result = await createCustomer({ ...form, idNumber: form.idNumber.trim() || undefined }, token);
      setForm(EMPTY);
      onCreated(result);
    } catch (err) {
      setApiError(err instanceof CustomerApiError ? err.message : 'An unexpected error occurred.');
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
