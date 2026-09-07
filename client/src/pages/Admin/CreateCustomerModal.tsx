import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { AddressMapField } from '../../components/ui/AddressMapField';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { createCustomer, CustomerApiError } from '../../api/customers';
import type { CreateCustomerResponse } from '../../api/customers';
import { getTenants } from '../../api/tenants';
import type { Tenant } from '../../api/tenants';
import { firstPasswordError } from '../../utils/passwordRules';
import { useLanguage } from '../../contexts/useLanguage';
import '../../components/ui/Modal.css';

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
  const [tenants,  setTenants]  = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');   // '' = root (dilo)
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => { if (open) { setForm(EMPTY); setErrors({}); setApiError(null); setPriceIncluded(false); setTenantId(''); setPin(null); } }, [open]);

  // Load tenants once the modal opens so the assignment dropdown is populated.
  useEffect(() => {
    if (!open || !token) return;
    getTenants(token).then(setTenants).catch(() => setTenants([]));
  }, [open, token]);

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
    setPin(null);
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
    // warnings here instead of an opaque server error (see passwordRules.ts).
    if (!form.password)               e.password = t.errPasswordRequired;
    else {
      const pwdErr = firstPasswordError(form.password, t);
      if (pwdErr) e.password = pwdErr;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setLoading(true);
    try {
      const result = await createCustomer({ ...form, idNumber: form.idNumber.trim() || undefined, isCompanyServicePriceIncludedInPrice: priceIncluded, tenantId: tenantId || null, latitude: pin?.lat ?? null, longitude: pin?.lon ?? null }, token);
      setForm(EMPTY);
      onCreated(result);
    } catch (err) {
      if (err instanceof CustomerApiError && err.errors) {
        // Map field-level errors from the API onto the form fields so they appear
        // inline (e.g. duplicate phone/email → red hint under the matching input).
        const fieldMap: Partial<Record<keyof FormState, string>> = {};
        for (const [key, messages] of Object.entries(err.errors)) {
          // ASP.NET Identity reports a reused email as a code, not a field name.
          if (key === 'DuplicateUserName' || key === 'DuplicateEmail') {
            fieldMap.email = t.errEmailTaken;
            continue;
          }
          if (key === 'DuplicateBusinessName') {
            fieldMap.businessName = t.errBusinessNameTaken;
            continue;
          }
          // FluentValidation property names may carry a "Dto." prefix.
          const bare = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
          const field = (bare.charAt(0).toLowerCase() + bare.slice(1)) as keyof FormState;
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
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.customerModalTitle}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p className="ui-modal__section-label">{t.customerPersonalSection}</p>
          <div className="ui-modal__row">
            <FormField label={t.firstName} value={form.firstName} onChange={set('firstName')} error={errors.firstName} placeholder={t.phFirstName} />
            <FormField label={t.lastName}  value={form.lastName}  onChange={set('lastName')}  error={errors.lastName}  placeholder={t.phLastName} />
          </div>
          <FormField label={t.businessName} value={form.businessName} onChange={set('businessName')} error={errors.businessName} placeholder={t.phBusinessName} />
          <div className="ui-modal__row">
            <FormField label={t.idNumber}    value={form.idNumber}    onChange={set('idNumber')}    error={errors.idNumber}    placeholder={t.phIdNumber} />
            <FormField label={t.phoneNumber} value={form.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber} placeholder={t.phPhone} />
          </div>

          <div className="ui-modal__divider" />

          <p className="ui-modal__section-label">{t.customerPickupSection}</p>
          <CityDistrictPicker
            cityValue={form.city} districtValue={form.district}
            onCityChange={setDirect('city')} onDistrictChange={setDirect('district')}
            cityError={errors.city} districtError={errors.district}
          />
          <AddressMapField
            label={t.streetAddress}
            placeholder={t.phStreetAddress}
            addressValue={form.address}
            onAddressChange={v => { setForm(f => ({ ...f, address: v })); setErrors(e => ({ ...e, address: undefined })); setApiError(null); }}
            addressError={errors.address}
            city={form.city}
            district={form.district}
            lat={pin?.lat ?? null}
            lon={pin?.lon ?? null}
            onPinChange={(lat, lon) => setPin(lat != null && lon != null ? { lat, lon } : null)}
            onCityChange={setDirect('city')}
            onDistrictChange={setDirect('district')}
          />

          <div className="ui-modal__divider" />

          <p className="ui-modal__section-label">{t.customerCredSection}</p>
          <FormField label={t.emailAddress} type="email"    value={form.email}    onChange={set('email')}    error={errors.email}    placeholder={t.phEmail} />
          <FormField label={t.password}     type="password" value={form.password} onChange={set('password')} error={errors.password} placeholder={t.phPassword} />
          <PasswordRequirements value={form.password} />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 12 }}>
            <input type="checkbox" checked={priceIncluded} onChange={e => setPriceIncluded(e.target.checked)} />
            <span style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
              {t.cgoServiceIncluded}
              <br />
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.cgoServiceIncludedHint}</span>
            </span>
          </label>

          {/* White-label tenant assignment — only shown when tenants exist. */}
          {tenants.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                {t.custTenantLabel}
              </label>
              <select
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                  color: 'var(--color-text)', fontSize: '0.88rem' }}
              >
                <option value="">{t.custTenantNoneOpt}</option>
                {tenants.map(tn => (
                  <option key={tn.id} value={tn.id}>{tn.displayName}</option>
                ))}
              </select>
              <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{t.custTenantHint}</div>
            </div>
          )}

          {apiError && <div className="ui-modal__error" role="alert">{apiError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost"   onClick={onClose}      disabled={loading}>{t.cancel}</button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t.customerSubmitting : t.customerSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
