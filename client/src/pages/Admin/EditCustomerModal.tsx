import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { adminUpdateCustomer, setCustomerTenant, CustomerApiError } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import { getTenants } from '../../api/tenants';
import type { Tenant } from '../../api/tenants';
import { useLanguage } from '../../contexts/useLanguage';
import '../../components/ui/Modal.css';

interface Props {
  customer: AdminCustomer | null;
  onClose: () => void;
  onSaved: (patch: Pick<AdminCustomer, 'firstName' | 'lastName' | 'idNumber' | 'businessName' | 'phoneNumber' | 'city' | 'district' | 'address' | 'tenantId' | 'tenantDisplayName'>) => void;
}

interface FormState {
  firstName: string; lastName: string; idNumber: string; businessName: string;
  phoneNumber: string; city: string; district: string; address: string;
}

/**
 * Admin edit of a customer's profile + pickup address. Reuses CreateCustomerModal's
 * layout (FormField + CityDistrictPicker) minus the credential fields — email is the
 * identity and password has its own admin flow.
 */
export function EditCustomerModal({ customer, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [form,     setForm]     = useState<FormState>({ firstName: '', lastName: '', idNumber: '', businessName: '', phoneNumber: '', city: '', district: '', address: '' });
  const [errors,   setErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [tenants,  setTenants]  = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');   // '' = root (dilo)

  useEffect(() => {
    if (!customer) return;
    setForm({
      firstName:   customer.firstName,
      lastName:    customer.lastName,
      idNumber:    customer.idNumber ?? '',
      businessName: customer.businessName,
      phoneNumber: customer.phoneNumber,
      city:        customer.city,
      district:    customer.district,
      address:     customer.address,
    });
    setTenantId(customer.tenantId ?? '');
    setErrors({});
    setApiError(null);
  }, [customer]);

  // Populate the tenant-assignment dropdown when the modal opens.
  useEffect(() => {
    if (!customer || !token) return;
    getTenants(token).then(setTenants).catch(() => setTenants([]));
  }, [customer, token]);

  if (!customer) return null;

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
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setLoading(true);
    try {
      const payload = {
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        idNumber:    form.idNumber.trim() || undefined,
        businessName: form.businessName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        city:        form.city.trim(),
        district:    form.district.trim(),
        address:     form.address.trim(),
      };
      await adminUpdateCustomer(customer.id, payload, token);
      // Tenant assignment is a separate admin-only command; only call it if it changed.
      const newTenantId = tenantId || null;
      if (newTenantId !== (customer.tenantId ?? null)) {
        await setCustomerTenant(customer.id, newTenantId, token);
      }
      const tenantDisplayName = newTenantId
        ? (tenants.find(tn => tn.id === newTenantId)?.displayName ?? null)
        : null;
      onSaved({ ...payload, idNumber: payload.idNumber ?? null, tenantId: newTenantId, tenantDisplayName });
    } catch (err) {
      if (err instanceof CustomerApiError && err.errors) {
        const fieldMap: Partial<Record<keyof FormState, string>> = {};
        for (const [key, messages] of Object.entries(err.errors)) {
          if (key === 'DuplicateBusinessName') { fieldMap.businessName = t.errBusinessNameTaken; continue; }
          const bare = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
          const field = (bare.charAt(0).toLowerCase() + bare.slice(1)) as keyof FormState;
          if (field in form) fieldMap[field] = messages[0];
        }
        if (Object.keys(fieldMap).length > 0) setErrors(prev => ({ ...prev, ...fieldMap }));
        else setApiError(err.message);
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
          <span className="ui-modal__title">{t.acupEditTitle}</span>
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
          <FormField label={t.streetAddress} value={form.address} onChange={set('address')} error={errors.address} placeholder={t.phStreetAddress} />

          {/* White-label tenant assignment — only shown when tenants exist. */}
          {tenants.length > 0 && (
            <>
              <div className="ui-modal__divider" />
              <p className="ui-modal__section-label">{t.custTenantLabel}</p>
              <select
                value={tenantId}
                onChange={e => { setTenantId(e.target.value); setApiError(null); }}
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
            </>
          )}

          {apiError && <div className="ui-modal__error" role="alert">{apiError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost"   onClick={onClose}      disabled={loading}>{t.cancel}</button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t.customerSubmitting : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
