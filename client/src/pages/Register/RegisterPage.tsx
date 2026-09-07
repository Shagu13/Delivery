import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerCustomer, CustomerApiError } from '../../api/customers';
import { FormField } from '../../components/ui/FormField';
import { AddressMapField } from '../../components/ui/AddressMapField';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { firstPasswordError } from '../../utils/passwordRules';
import { useLanguage } from '../../contexts/useLanguage';
import './register.css';

interface FormState {
  firstName:       string;
  lastName:        string;
  idNumber:        string;
  businessName:    string;
  phoneNumber:     string;
  city:            string;
  district:        string;
  address:         string;
  email:           string;
  password:        string;
  confirmPassword: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', idNumber: '', businessName: '',
  phoneNumber: '', city: '', district: '', address: '',
  email: '', password: '', confirmPassword: '',
};

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form,     setForm]     = useState<FormState>(EMPTY);
  const [errors,   setErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  // Exact pickup coordinates from the map pin (kept out of FormState — not a text field).
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);

  const set = (field: keyof FormState) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: ev.target.value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setApiError(null);
  };

  // ID number: digits only, capped at 11.
  const setIdNumber = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const digits = ev.target.value.replace(/\D/g, '').slice(0, 11);
    setForm(f => ({ ...f, idNumber: digits }));
    setErrors(prev => ({ ...prev, idNumber: undefined }));
    setApiError(null);
  };

  const setDirect = (field: 'city' | 'district') => (value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setApiError(null);
    // A changed city/district invalidates any pin dropped for the old area.
    setPin(null);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim())    e.firstName    = t.errFirstNameRequired;
    if (!form.lastName.trim())     e.lastName     = t.errLastNameRequired;
    if (!form.businessName.trim()) e.businessName = t.errBusinessNameRequired;
    if (!form.idNumber.trim())          e.idNumber = t.errIdRequired;
    else if (form.idNumber.length !== 11) e.idNumber = t.errIdLength;
    if (!form.phoneNumber.trim())  e.phoneNumber  = t.errPhoneRequired;
    else if (form.phoneNumber.trim().length !== 9) e.phoneNumber = t.errPhoneLength;
    if (!form.city.trim())         e.city         = t.errCityRequired;
    if (!form.district.trim())     e.district     = t.errDistrictRequired;
    if (!form.address.trim())      e.address      = t.errAddressRequired;
    if (!form.email.trim()) {
      e.email = t.errEmailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = t.errEmailInvalid;
    }
    // Mirror ASP.NET Identity's password policy so unmet rules surface here as
    // clear warnings instead of an opaque server error (see passwordRules.ts).
    if (!form.password)               e.password = t.errPasswordRequired;
    else {
      const pwdErr = firstPasswordError(form.password, t);
      if (pwdErr) e.password = pwdErr;
    }
    if (!form.confirmPassword)        e.confirmPassword  = t.errConfirmPasswordRequired;
    else if (form.password !== form.confirmPassword) e.confirmPassword = t.errPasswordMismatch;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await registerCustomer({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        idNumber: form.idNumber.trim() || undefined,
        businessName: form.businessName.trim(), phoneNumber: form.phoneNumber.trim(),
        city: form.city.trim(), district: form.district.trim(),
        address: form.address.trim(), email: form.email.trim(),
        password: form.password, confirmPassword: form.confirmPassword,
        latitude: pin?.lat ?? null, longitude: pin?.lon ?? null,
      });
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      if (err instanceof CustomerApiError && err.errors) {
        // Map field-level errors from the API onto the form fields so they
        // appear inline (e.g. duplicate phone → red hint under the phone input).
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

  // Every unmet validation, in form order, for an at-a-glance summary banner.
  const errorMessages = (Object.values(errors).filter(Boolean) as string[]);

  return (
    <div className="register-page">
      <div className="register-card">
        <div className="register-card__logo">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t.appName}
        </div>

        <h1 className="register-card__title">{t.registerTitle}</h1>

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

          {errorMessages.length > 0 && (
            <div className="register-form__error register-form__error--summary" role="alert">
              <div className="register-form__error-title">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {t.errFixTitle}
              </div>
              <ul className="register-form__error-list">
                {errorMessages.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {/* Personal */}
          <p className="register-form__section-label">{t.registerPersonal}</p>
          <div className="register-form__row">
            <FormField label={t.firstName} value={form.firstName} onChange={set('firstName')} error={errors.firstName} placeholder={t.phFirstName} />
            <FormField label={t.lastName}  value={form.lastName}  onChange={set('lastName')}  error={errors.lastName}  placeholder={t.phLastName} />
          </div>
          <FormField
            label={t.businessName}
            value={form.businessName}
            onChange={set('businessName')}
            error={errors.businessName}
            placeholder={t.phBusinessName}
          />
          <div className="register-form__row">
            <FormField label={t.idNumber}    required value={form.idNumber}    onChange={setIdNumber}        error={errors.idNumber}    placeholder={t.phIdNumberRequired} inputMode="numeric" maxLength={11} />
                    <FormField label={t.phoneNumber} value={form.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber} placeholder={t.phPhone} maxLength={9} />
          </div>

          <div className="register-form__divider" />

          {/* Pickup address */}
          <p className="register-form__section-label">{t.registerPickup}</p>
          <CityDistrictPicker
            cityValue={form.city}
            districtValue={form.district}
            onCityChange={setDirect('city')}
            onDistrictChange={setDirect('district')}
            cityError={errors.city}
            districtError={errors.district}
          />
          <AddressMapField
            label={t.streetAddress}
            placeholder={t.phStreetAddress}
            addressValue={form.address}
            onAddressChange={v => { setForm(f => ({ ...f, address: v })); setErrors(prev => ({ ...prev, address: undefined })); setApiError(null); }}
            addressError={errors.address}
            city={form.city}
            district={form.district}
            lat={pin?.lat ?? null}
            lon={pin?.lon ?? null}
            onPinChange={(lat, lon) => setPin(lat != null && lon != null ? { lat, lon } : null)}
            onCityChange={setDirect('city')}
            onDistrictChange={setDirect('district')}
          />

          <div className="register-form__divider" />

          {/* Credentials */}
          <FormField
            label={t.emailAddress} type="email" autoComplete="email"
            value={form.email} onChange={set('email')} error={errors.email} placeholder={t.phEmail}
          />
          <FormField
            label={t.password} type="password" autoComplete="new-password"
            value={form.password} onChange={set('password')} error={errors.password} placeholder={t.phPassword}
          />
          <PasswordRequirements value={form.password} />
          <FormField
            label={t.confirmPassword} type="password" autoComplete="new-password"
            value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} placeholder={t.phConfirmPassword}
          />

          <button type="submit" className="register-form__submit" disabled={loading}>
            {loading ? t.registerSubmitting : t.registerSubmit}
          </button>

          <p className="register-form__login-link">
            {t.registerHaveAccount} <Link to="/login">{t.registerSignIn}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
