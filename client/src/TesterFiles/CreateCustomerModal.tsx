import { useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { createCustomer, CustomerApiError } from '../../api/customers';
import type { CreateCustomerResponse } from '../../api/customers';

interface Props {
  open:      boolean;
  onClose:   () => void;
  onCreated: (customer: CreateCustomerResponse) => void;
}

interface FormState {
  // Personal
  firstName:    string;
  lastName:     string;
  idNumber:     string;          // optional — submitted as undefined if empty
  businessName: string;
  phoneNumber:  string;
  // Default pickup address
  city:         string;
  district:     string;
  address:      string;
  // Login
  username:     string;
  password:     string;
}

const EMPTY: FormState = {
  firstName:    '',
  lastName:     '',
  idNumber:     '',
  businessName: '',
  phoneNumber:  '',
  city:         '',
  district:     '',
  address:      '',
  username:     '',
  password:     '',
};

export function CreateCustomerModal({ open, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const [form,     setForm]     = useState<FormState>(EMPTY);
  const [errors,   setErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  if (!open) return null;

  const set = (field: keyof FormState) => (value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
    setApiError(null);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim())    e.firstName    = 'First name is required.';
    if (!form.lastName.trim())     e.lastName     = 'Last name is required.';
    if (!form.businessName.trim()) e.businessName = 'Business or page name is required.';
    if (!form.phoneNumber.trim())  e.phoneNumber  = 'Phone number is required.';
    if (!form.city.trim())         e.city         = 'City is required.';
    if (!form.district.trim())     e.district     = 'District is required.';
    if (!form.address.trim())      e.address      = 'Address is required.';
    if (!form.username.trim())     e.username     = 'Username is required.';
    if (form.password.length < 8)  e.password     = 'Password must be at least 8 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setLoading(true);
    try {
      const result = await createCustomer(
        {
          ...form,
          idNumber: form.idNumber.trim() || undefined,
        },
        token,
      );
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
          <span className="modal__title">New Customer</span>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal__body">
          {/* ── Personal ── */}
          <p className="modal__section-label">Personal information</p>
          <div className="form-row">
            <FormField label="First name" value={form.firstName} onChange={set('firstName')} error={errors.firstName} />
            <FormField label="Last name"  value={form.lastName}  onChange={set('lastName')}  error={errors.lastName} />
          </div>
          <FormField
            label="Business / page name"
            value={form.businessName}
            onChange={set('businessName')}
            error={errors.businessName}
            placeholder="e.g. My Online Shop, Nike Georgia"
          />
          <div className="form-row">
            <FormField
              label="ID number"
              value={form.idNumber}
              onChange={set('idNumber')}
              error={errors.idNumber}
              placeholder="National ID / Passport (optional)"
            />
            <FormField
              label="Phone number"
              value={form.phoneNumber}
              onChange={set('phoneNumber')}
              error={errors.phoneNumber}
              placeholder="5XX XXX XXX"
            />
          </div>

          <div className="modal__divider" />

          {/* ── Default pickup address ── */}
          <p className="modal__section-label">Default pickup address</p>
          <div className="form-row">
            <FormField label="City"     value={form.city}     onChange={set('city')}     error={errors.city}     placeholder="e.g. Tbilisi" />
            <FormField label="District" value={form.district} onChange={set('district')} error={errors.district} placeholder="e.g. Vake" />
          </div>
          <FormField
            label="Street address"
            value={form.address}
            onChange={set('address')}
            error={errors.address}
            placeholder="e.g. 12 Rustaveli Avenue, Apt 4"
          />

          <div className="modal__divider" />

          {/* ── Login ── */}
          <p className="modal__section-label">Login credentials</p>
          <FormField label="Username" value={form.username} onChange={set('username')} error={errors.username} />
          <FormField label="Password" value={form.password} onChange={set('password')} error={errors.password} type="password" />

          {apiError && (
            <div className="form-error-banner" role="alert">{apiError}</div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn-ghost"    onClick={onClose}       disabled={loading}>Cancel</button>
          <button className="btn-primary"  onClick={handleSubmit}  disabled={loading}>
            {loading ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
