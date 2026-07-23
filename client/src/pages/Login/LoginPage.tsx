import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { login, AuthError } from '../../api/auth';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { homeFor } from '../../components/ProtectedRoute';
import { useLanguage } from '../../contexts/useLanguage';
import { useBranding } from '../../contexts/BrandingContext';
import { saveCredentials } from '../../utils/saveCredentials';
import './login.css';

export function LoginPage() {
  const { signIn, isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const { brandName, isTenant } = useBranding();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname;

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    navigate(homeFor(user.role), { replace: true });
  }, [isAuthenticated, user, navigate]);

  const registered    = (location.state as { registered?:    boolean })?.registered    === true;
  const passwordReset = (location.state as { passwordReset?: boolean })?.passwordReset === true;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [savePassword, setSavePassword] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError(t.loginEmptyFields);
      return;
    }
    setLoading(true);
    try {
      const userData = await login({ username: username.trim(), password });
      // Offer the credentials to the password manager while the form is still
      // mounted — signIn() flips isAuthenticated and unmounts this page.
      if (savePassword) await saveCredentials(username.trim(), password);
      signIn(userData);
      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else {
        navigate(homeFor(userData.role), { replace: true });
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'An unexpected error occurred. Please try again.');
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
          {isTenant ? brandName : t.appName}
        </div>

        <p className="login-card__eyebrow">{t.loginEyebrow}</p>
        <h1 className="login-card__title">{t.loginTitle}</h1>

        {/* Registration success banner */}
        {registered && (
          <div className="login-card__success" role="status">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.loginSuccess}
          </div>
        )}

        {/* Password reset success banner */}
        {passwordReset && (
          <div className="login-card__success" role="status">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.loginPasswordResetSuccess}
          </div>
        )}

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

          {/* name + id are what mobile password managers key off to offer "save password" */}
          <FormField
            label={t.emailOrUsername}
            required
            type="text"
            id="login-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t.phEmail}
            autoFocus
          />
          <FormField
            label={t.password}
            required
            type="password"
            id="login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t.phPassword}
          />

          {/* Save-password tick + forgot link — sit between field and submit button */}
          <div className="login-form__forgot-wrap">
            <label className="login-form__save">
              <input
                type="checkbox"
                checked={savePassword}
                onChange={e => setSavePassword(e.target.checked)}
              />
              {t.loginSavePassword}
            </label>
            <Link to="/forgot-password" className="login-form__forgot">
              {t.loginForgotPassword}
            </Link>
          </div>

          <button type="submit" className="login-form__submit" disabled={loading}>
            {loading ? <><span className="spinner" />{t.loginSubmitting}</> : t.loginSubmit}
          </button>
        </form>

        <div className="login-card__back">
          <Link to="/">{t.backToHome}</Link>
          <span className="login-card__back-sep">   /   </span>
          <Link to="/register">{t.createAccount}</Link>
        </div>
      </div>
    </div>
  );
}
