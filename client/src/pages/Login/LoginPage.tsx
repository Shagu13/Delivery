import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { login, AuthError } from '../../api/auth';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import './login.css';

export function LoginPage() {
  const { signIn, isAuthenticated, user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const from = (location.state as { from?: Location })?.from?.pathname;

  // If already logged in, bounce to the right dashboard
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const dest =
      user.role === 'Admin'    ? '/admin'    :
      user.role === 'Customer' ? '/customer' : '/courier';
    navigate(dest, { replace: true });
  }, [isAuthenticated, user, navigate]);

  // Detect if we came from the register page — show a success notice
  const registered = (location.state as { registered?: boolean })?.registered === true;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('Please enter your email / username and password.');
      return;
    }

    setLoading(true);
    try {
      const userData = await login({ username: username.trim(), password });
      signIn(userData);

      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else {
        const dest =
          userData.role === 'Admin'    ? '/admin'    :
          userData.role === 'Customer' ? '/customer' : '/courier';
        navigate(dest, { replace: true });
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
          Delivery
        </div>

        <p className="login-card__eyebrow">Sign In</p>
        <h1 className="login-card__title">Welcome back</h1>

        {/* ── Registration success banner ── */}
        {registered && (
          <div className="login-card__success" role="status">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Account created! Sign in with your email below.
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

          <FormField
            label="Email / Username"
            required
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />

          <FormField
            label="Password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
          />

          <button type="submit" className="login-form__submit" disabled={loading}>
            {loading ? <><span className="spinner" />Signing in…</> : 'Sign In'}
          </button>
        </form>

        <div className="login-card__back">
          <Link to="/">← Back to home</Link>
          <span className="login-card__back-sep">   /   </span>
          <Link to="/register">Create account</Link>
        </div>
      </div>
    </div>
  );
}
