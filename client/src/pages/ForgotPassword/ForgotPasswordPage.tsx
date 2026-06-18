import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword, AuthError } from '../../api/auth';
import { useLanguage } from '../../contexts/useLanguage';
import '../Login/login.css';

export function ForgotPasswordPage() {
  const { t } = useLanguage();

  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.errEmailInvalid);
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) {
      setError(t.errPhoneLength);
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email.trim(), digits);
      setSent(true);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : t.forgotPwdFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-card__logo">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t.appName}
        </div>

        <p className="login-card__eyebrow">{t.forgotPwdEyebrow}</p>
        <h1 className="login-card__title">{t.forgotPwdTitle}</h1>

        {/* Sent confirmation — shown after successful submit */}
        {sent ? (
          <div className="login-card__success">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6.5 10l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.forgotPwdSent}</span>
          </div>
        ) : (
          <>
            <p className="login-card__hint">{t.forgotPwdHint}</p>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="login-form__error" role="alert">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {error}
                </div>
              )}

              <div className="login-form__field">
                <label className="login-form__label" htmlFor="email">
                  {t.emailAddress}
                </label>
                <input
                  id="email"
                  className="login-form__input"
                  type="email"
                  autoComplete="email"
                  placeholder={t.phEmail}
                  value={email}
                  onChange={e => { setError(null); setEmail(e.target.value); }}
                  maxLength={256}
                  autoFocus
                />
              </div>

              <div className="login-form__field">
                <label className="login-form__label" htmlFor="phone">
                  {t.phoneNumber}
                </label>
                <div className="login-form__phone-wrap">
                  <span className="login-form__phone-prefix">+995</span>
                  <input
                    id="phone"
                    className="login-form__input login-form__input--phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder={t.phPhone}
                    value={phone}
                    onChange={e => {
                      setError(null);
                      setPhone(e.target.value.replace(/[^\d\s]/g, ''));
                    }}
                    maxLength={13}
                  />
                </div>
              </div>

              <button type="submit" className="login-form__submit" disabled={loading}>
                {loading
                  ? <><span className="spinner" />{t.forgotPwdSubmitting}</>
                  : t.forgotPwdSubmit}
              </button>
            </form>
          </>
        )}

        <div className="login-card__back">
          <Link to="/login">{t.forgotPwdBackToLogin}</Link>
        </div>
      </div>
    </div>
  );
}
