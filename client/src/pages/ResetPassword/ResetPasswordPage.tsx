import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword, AuthError } from '../../api/auth';
import { FormField } from '../../components/ui/FormField';
import { useLanguage } from '../../contexts/useLanguage';
import '../Login/login.css';

export function ResetPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Only the short code is in the URL now — e.g. /reset-password?code=A3K9PQ2X1B
  const code = params.get('code') ?? '';

  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const missingCode = !code;

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(f => ({ ...f, [field]: e.target.value }));
      setErrors(prev => ({ ...prev, [field]: undefined }));
      setApiError(null);
    };

  const validate = (): boolean => {
    const e: Partial<typeof form> = {};
    if (form.newPassword.length < 8)
      e.newPassword = t.errPasswordShort;
    else if (!/[A-Z]/.test(form.newPassword))
      e.newPassword = t.custErrNewPwdUppercase;
    else if (!/[0-9]/.test(form.newPassword))
      e.newPassword = t.custErrNewPwdNumber;
    if (form.newPassword !== form.confirmPassword)
      e.confirmPassword = t.errPasswordMismatch;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await resetPassword({
        code,
        newPassword:        form.newPassword,
        confirmNewPassword: form.confirmPassword,
      });
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      setApiError(err instanceof AuthError ? err.message : t.resetPwdFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__logo">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t.appName}
        </div>

        <p className="login-card__eyebrow">{t.resetPwdEyebrow}</p>
        <h1 className="login-card__title">{t.resetPwdTitle}</h1>

        {missingCode ? (
          <div className="login-form__error" role="alert" style={{ marginBottom: 0 }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t.resetPwdInvalidLink}
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {apiError && (
              <div className="login-form__error" role="alert">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {apiError}
              </div>
            )}

            <FormField
              label={t.custNewPassword}
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={set('newPassword')}
              error={errors.newPassword}
              placeholder={t.custNewPasswordPh}
              autoFocus
            />
            <FormField
              label={t.custConfirmNewPassword}
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              error={errors.confirmPassword}
              placeholder={t.custRepeatNewPassword}
            />

            <button type="submit" className="login-form__submit" disabled={loading}>
              {loading
                ? <><span className="spinner" />{t.resetPwdSubmitting}</>
                : t.resetPwdSubmit}
            </button>
          </form>
        )}

        <div className="login-card__back">
          <Link to="/login">{t.forgotPwdBackToLogin}</Link>
        </div>
      </div>
    </div>
  );
}
