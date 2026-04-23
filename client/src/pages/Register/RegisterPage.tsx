import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerCustomer, CustomerApiError } from '../../api/customers';
import { FormField } from '../../components/ui/FormField';
import './register.css';

interface FormState {
  firstName:    string;
  lastName:     string;
  idNumber:     string;
  businessName: string;
  phoneNumber:  string;
  city:         string;
  district:     string;
  address:      string;
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

export function RegisterPage() {
  const navigate = useNavigate();
  const [form,     setForm]     = useState<FormState>(EMPTY);
  const [errors,   setErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const set = (field: keyof FormState) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    const value = ev.target.value;
    setForm(f => ({ ...f, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await registerCustomer({
        ...form,
        idNumber: form.idNumber.trim() || undefined,
      });
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setApiError(err instanceof CustomerApiError ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <div className="register-card__logo">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Delivery
        </div>

        <p className="register-card__eyebrow">Customer Portal</p>
        <h1 className="register-card__title">Create your account</h1>

        <form className="register-form" onSubmit={handleSubmit} noValidate>
          {apiError && (
            <div className="register-form__error" role="alert">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {apiError}
            </div>
          )}

          <p className="register-form__section-label">Personal information</p>
          <div className="register-form__row">
            <FormField label="First name"  value={form.firstName}  onChange={set('firstName')}  error={errors.firstName} />
            <FormField label="Last name"   value={form.lastName}   onChange={set('lastName')}   error={errors.lastName} />
          </div>
          <FormField
            label="Business / page name"
            value={form.businessName}
            onChange={set('businessName')}
            error={errors.businessName}
            placeholder="e.g. My Online Shop"
          />
          <div className="register-form__row">
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

          <div className="register-form__divider" />

          <p className="register-form__section-label">Default pickup address</p>
          <div className="register-form__row">
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

          <div className="register-form__divider" />

          <p className="register-form__section-label">Login credentials</p>
          <FormField label="Username" value={form.username} onChange={set('username')} error={errors.username} />
          <FormField label="Password" value={form.password} onChange={set('password')} error={errors.password} type="password" />

          <button type="submit" className="register-form__submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="register-form__login-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
