import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword, type ForgotPasswordResult } from '../../api/auth';
import { useLanguage } from '../../contexts/useLanguage';
import { DetailsStep } from './DetailsStep';
import { CodeStep } from './CodeStep';
import { NewPasswordStep } from './NewPasswordStep';
import '../Login/login.css';

type Step = 'details' | 'code' | 'password';

/**
 * Password recovery in three steps: email + phone → 6-digit SMS code → new password.
 * Works for customers and couriers alike (the server finds whichever account owns the phone).
 */
export function ForgotPasswordPage() {
  const { t } = useLanguage();

  const [step,     setStep]     = useState<Step>('details');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [ticket,   setTicket]   = useState('');
  const [timing,   setTiming]   = useState<ForgotPasswordResult>({ expiresInSeconds: 300, resendInSeconds: 60 });
  const [issuedAt, setIssuedAt] = useState(0);

  const codeSent = (nextEmail: string, nextPhone: string, result: ForgotPasswordResult) => {
    setEmail(nextEmail);
    setPhone(nextPhone);
    setTiming(result);
    setIssuedAt(Date.now());
    setStep('code');
  };

  const resend = async () => {
    const result = await forgotPassword(email, phone.replace(/\D/g, ''));
    setTiming(result);
    setIssuedAt(Date.now());
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

        <p className="login-card__eyebrow">
          {step === 'password' ? t.resetPwdEyebrow : t.forgotPwdEyebrow}
        </p>
        <h1 className="login-card__title">
          {step === 'details' ? t.forgotPwdTitle : step === 'code' ? t.resetCodeTitle : t.resetPwdTitle}
        </h1>

        {step === 'details' && (
          <DetailsStep initialEmail={email} initialPhone={phone} onSent={codeSent} />
        )}
        {step === 'code' && (
          <CodeStep
            email={email}
            issuedAt={issuedAt}
            timing={timing}
            onVerified={tk => { setTicket(tk); setStep('password'); }}
            onResend={resend}
            onBack={() => setStep('details')}
          />
        )}
        {step === 'password' && <NewPasswordStep ticket={ticket} />}

        <div className="login-card__back">
          <Link to="/login">{t.forgotPwdBackToLogin}</Link>
        </div>
      </div>
    </div>
  );
}
