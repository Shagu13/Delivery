import { useState, useCallback, useEffect } from 'react';
import { createCourier, CourierApiError } from '../../api/couriers';
import type { CreateCourierResponse } from '../../api/couriers';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (courier: CreateCourierResponse) => void;
}

interface FormData {
  firstName: string; lastName: string; idNumber: string; phoneNumber: string;
  assignedCity: string; assignedDistrict: string; username: string; password: string;
}

type FieldErrors = Partial<Record<keyof FormData, string>>;

const EMPTY: FormData = { firstName: '', lastName: '', idNumber: '', phoneNumber: '', assignedCity: '', assignedDistrict: '', username: '', password: '' };

export function CreateCourierModal({ open, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [form,        setForm]        = useState<FormData>(EMPTY);
  const [errors,      setErrors]      = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [showPassword,setShowPassword]= useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm(EMPTY);
        setErrors({});
        setGlobalError(null);
    }, [open]);

  const handleChange = useCallback((field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }, []);

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!form.firstName.trim())       e.firstName       = t.errFirstNameRequired;
    if (!form.lastName.trim())        e.lastName        = t.errLastNameRequired;
    if (!form.idNumber.trim())        e.idNumber        = t.errIdRequired;
    if (!form.phoneNumber.trim())     e.phoneNumber     = t.errPhoneRequired;
    if (!form.assignedCity.trim())    e.assignedCity    = t.errCityRequired;
    if (!form.assignedDistrict.trim()) e.assignedDistrict = t.errDistrictRequired;
    if (!form.username.trim())        e.username        = t.errUsernameRequired;
    else if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) e.username = t.errUsernameChars;
    if (!form.password)               e.password        = t.errPasswordRequired;
    else if (form.password.length < 8) e.password       = t.errPasswordShort;
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }
    if (!token) return;
    setSubmitting(true);
    try {
      const result = await createCourier({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        idNumber: form.idNumber.trim(), phoneNumber: form.phoneNumber.trim(),
        assignedCity: form.assignedCity.trim(), assignedDistrict: form.assignedDistrict.trim(),
        username: form.username.trim(), password: form.password,
      }, token);
      onCreated(result);
    } catch (err) {
      if (err instanceof CourierApiError) {
        if (err.errors) {
          const mapped: FieldErrors = {};
          Object.entries(err.errors).forEach(([key, msgs]) => {
            const k = key.charAt(0).toLowerCase() + key.slice(1) as keyof FormData;
            mapped[k] = msgs[0];
          });
          setErrors(mapped);
        }
        setGlobalError(err.message);
      } else {
        setGlobalError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal__header">
          <div>
            <p className="modal__eyebrow">{t.courierModalEyebrow}</p>
            <h2 className="modal__title" id="modal-title">{t.courierModalTitle}</h2>
          </div>
          <button className="modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit} noValidate>
          {globalError && (
            <div className="modal__global-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {globalError}
            </div>
          )}

          <fieldset className="modal__fieldset">
            <legend className="modal__legend">{t.courierPersonalSection}</legend>
            <div className="modal__grid">
              <FormField label={t.firstName} required value={form.firstName} onChange={e => handleChange('firstName', e.target.value)} error={errors.firstName} placeholder={t.phFirstName} maxLength={100} autoFocus />
              <FormField label={t.lastName}  required value={form.lastName}  onChange={e => handleChange('lastName',  e.target.value)} error={errors.lastName}  placeholder={t.phLastName}  maxLength={100} />
              <FormField label={t.idNumber}  required value={form.idNumber}  onChange={e => handleChange('idNumber',  e.target.value)} error={errors.idNumber}  placeholder={t.phIdNumberRequired} maxLength={50} />
              <FormField label={t.phoneNumber} required type="tel" value={form.phoneNumber} onChange={e => handleChange('phoneNumber', e.target.value)} error={errors.phoneNumber} placeholder={t.phPhoneFull} maxLength={20} />
            </div>
          </fieldset>

          <fieldset className="modal__fieldset">
            <legend className="modal__legend">{t.courierTerritorySection}</legend>
            <CityDistrictPicker
              cityValue={form.assignedCity}
              districtValue={form.assignedDistrict}
              onCityChange={val => handleChange('assignedCity', val)}
              onDistrictChange={val => handleChange('assignedDistrict', val)}
              cityError={errors.assignedCity}
              districtError={errors.assignedDistrict}
            />
          </fieldset>

          <fieldset className="modal__fieldset">
            <legend className="modal__legend">{t.courierCredSection}</legend>
            <FormField label={t.username} required value={form.username} onChange={e => handleChange('username', e.target.value)} error={errors.username} placeholder={t.phUsername} maxLength={50} autoComplete="off" />
            <div className={`form-field ${errors.password ? 'form-field--error' : ''}`}>
              <label className="form-field__label">{t.password} <span className="form-field__required">*</span></label>
              <div className="modal__password-wrap">
                <input className="form-field__input" type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => handleChange('password', e.target.value)} placeholder={t.phPasswordMin} autoComplete="new-password" />
                <button type="button" className="modal__password-toggle" onClick={() => setShowPassword(p => !p)} aria-label={showPassword ? 'Hide' : 'Show'}>
                  {showPassword
                    ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.6A2 2 0 0010 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M3.5 4.6C2.2 5.6 1 7 1 8c0 0 2.5 5 7 5a7.3 7.3 0 003.4-.9M6 3.2A7 7 0 0115 8c-.4 1-1 2-1.7 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></svg>
                  }
                </button>
              </div>
              {errors.password && <span className="form-field__error">{errors.password}</span>}
            </div>
          </fieldset>

          <div className="modal__footer">
            <button type="button" className="modal__btn-cancel" onClick={onClose} disabled={submitting}>{t.cancel}</button>
            <button type="submit" className="modal__btn-submit" disabled={submitting}>
              {submitting
                ? <><span className="btn__spinner" />{t.submitting}</>
                : <><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{t.courierSubmit}</>
              }
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.45);backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
        .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.18),0 4px 16px rgba(0,0,0,0.1);animation:modal-slide-up 0.22s ease both; }
        .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:24px 24px 20px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1; }
        .modal__eyebrow { font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px; }
        .modal__title { font-family:var(--font-display);font-size:1.3rem;font-weight:800;letter-spacing:-0.025em;color:var(--color-text);margin:0; }
        .modal__close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text-muted);cursor:pointer;transition:background var(--transition),color var(--transition);flex-shrink:0; }
        .modal__close:hover { background:var(--color-error-bg);color:var(--color-error);border-color:rgba(192,57,43,0.2); }
        .modal__body { padding:24px;display:flex;flex-direction:column;gap:24px; }
        .modal__global-error { display:flex;align-items:center;gap:9px;background:var(--color-error-bg);border:1px solid rgba(192,57,43,0.2);border-radius:var(--radius-sm);color:var(--color-error);font-size:0.84rem;font-weight:500;padding:10px 14px; }
        .modal__fieldset { border:none;padding:0;display:flex;flex-direction:column;gap:14px; }
        .modal__legend { font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-text-subtle);margin-bottom:4px;padding:0;width:100%; }
        .modal__grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
        @media (max-width:480px) { .modal__grid { grid-template-columns:1fr; } }
        .modal__password-wrap { position:relative; }
        .modal__password-wrap .form-field__input { padding-right:42px; }
        .modal__password-toggle { position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--color-text-subtle);display:flex;align-items:center;padding:2px;transition:color var(--transition); }
        .modal__password-toggle:hover { color:var(--color-text-muted); }
        .modal__footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px;border-top:1px solid var(--color-border); }
        .modal__btn-cancel { padding:10px 20px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius-md);font-family:var(--font-body);font-size:0.875rem;font-weight:600;color:var(--color-text-muted);cursor:pointer;transition:background var(--transition),border-color var(--transition),color var(--transition); }
        .modal__btn-cancel:hover:not(:disabled) { background:var(--color-bg-3);border-color:var(--color-text-muted);color:var(--color-text); }
        .modal__btn-cancel:disabled { opacity:0.5;cursor:not-allowed; }
        .modal__btn-submit { display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:var(--color-accent);border:none;border-radius:var(--radius-md);font-family:var(--font-body);font-size:0.875rem;font-weight:600;color:#fff;cursor:pointer;transition:background var(--transition),box-shadow var(--transition); }
        .modal__btn-submit:hover:not(:disabled) { background:#d4891a;box-shadow:0 4px 16px rgba(196,127,23,0.28); }
        .modal__btn-submit:disabled { opacity:0.6;cursor:not-allowed; }
        @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 16px))} to{opacity:1;transform:translate(-50%,-50%)} }
      `}</style>
    </>
  );
}
