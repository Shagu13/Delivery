import { useState } from 'react';
import { forgotPassword, type ForgotPasswordResult } from '../../api/auth';
import { useLanguage } from '../../contexts/useLanguage';
import { ErrorBanner } from './ErrorBanner';
import { resetErrorMessage } from './resetErrors';
import '../Login/login.css';

interface Props {
  initialEmail: string;
  initialPhone: string;
  onSent: (email: string, phone: string, timing: ForgotPasswordResult) => void;
}

/** Step 1 — email + phone; on success the server has texted the 6-digit code. */
export function DetailsStep({ initialEmail, initialPhone, onSent }: Props) {
  const { t } = useLanguage();
  const [email,   setEmail]   = useState(initialEmail);
  const [phone,   setPhone]   = useState(initialPhone);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // The server lower-cases too; doing it here keeps what we send and what we show consistent.
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
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
      const timing = await forgotPassword(cleanEmail, digits);
      onSent(cleanEmail, phone, timing);
    } catch (err) {
      setError(resetErrorMessage(err, t, t.forgotPwdFailed));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <p className="login-card__hint">{t.forgotPwdHint}</p>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}

        <div className="login-form__field">
          <label className="login-form__label" htmlFor="email">{t.emailAddress}</label>
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
          <label className="login-form__label" htmlFor="phone">{t.phoneNumber}</label>
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
  );
}
