import { useEffect, useState } from 'react';
import { verifyResetCode, type ForgotPasswordResult } from '../../api/auth';
import { useLanguage } from '../../contexts/useLanguage';
import { ErrorBanner } from './ErrorBanner';
import { resetErrorMessage } from './resetErrors';
import '../Login/login.css';

interface Props {
  email: string;
  /** When the current code was sent (Date.now()); the lifetimes come from the server. */
  issuedAt: number;
  timing: ForgotPasswordResult;
  onVerified: (ticket: string) => void;
  onResend: () => Promise<void>;
  onBack: () => void;
}

const mmss = (totalSeconds: number) =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;

/** Step 2 — 6-digit code with a validity countdown and a resend button. */
export function CodeStep({ email, issuedAt, timing, onVerified, onResend, onBack }: Props) {
  const { t } = useLanguage();
  const [code,      setCode]      = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [now,       setNow]       = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((issuedAt + timing.expiresInSeconds * 1000 - now) / 1000));
  const resendIn    = Math.max(0, Math.ceil((issuedAt + timing.resendInSeconds * 1000 - now) / 1000));
  const expired     = secondsLeft === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError(t.errCodeLength);
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      onVerified(await verifyResetCode(email, code));
    } catch (err) {
      setError(resetErrorMessage(err, t, t.resetPwdFailed));
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResending(true);
    try {
      await onResend();
      setCode('');
    } catch (err) {
      setError(resetErrorMessage(err, t, t.forgotPwdFailed));
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <p className="login-card__hint">{t.resetCodeHint}</p>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}

        <div className="login-form__field">
          <label className="login-form__label" htmlFor="reset-code">{t.resetCodeLabel}</label>
          <input
            id="reset-code"
            className="login-form__input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={e => { setError(null); setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }}
            maxLength={6}
            style={{ letterSpacing: '0.4em', textAlign: 'center', fontSize: '1.25rem' }}
            autoFocus
          />
        </div>

        <p className="login-card__hint" role="timer" style={{ textAlign: 'center', margin: 0 }}>
          {expired ? t.resetCodeExpired : t.resetCodeExpiresIn(mmss(secondsLeft))}
        </p>

        <button type="submit" className="login-form__submit" disabled={verifying || expired}>
          {verifying
            ? <><span className="spinner" />{t.resetCodeVerifying}</>
            : t.resetCodeSubmit}
        </button>

        <button
          type="button"
          className="login-form__submit"
          style={{ background: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}
          onClick={handleResend}
          disabled={resendIn > 0 || resending}
        >
          {resendIn > 0 ? t.resetCodeResendIn(resendIn) : t.resetCodeResend}
        </button>
      </form>

      <div className="login-card__back">
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}
        >
          {t.resetCodeChangeDetails}
        </button>
      </div>
    </>
  );
}
