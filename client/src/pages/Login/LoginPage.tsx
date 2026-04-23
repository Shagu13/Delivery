import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { login, AuthError } from '../../api/auth';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import './login.css';

export function LoginPage() {
  const { signIn, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If already logged in, bounce to the right dashboard immediately
  if (isAuthenticated && user) {
    const dest = user.role === 'Admin' ? '/admin' : '/courier';
    navigate(dest, { replace: true });
  }

  const from = (location.state as { from?: Location })?.from?.pathname;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }

    setLoading(true);
    try {
      const userData = await login({ username: username.trim(), password });
      signIn(userData);

      // Redirect to where they came from, or role-based default
      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else {
        navigate(userData.role === 'Admin' ? '/admin' : '/courier', { replace: true });
      }
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
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
            <path
              d="M7 14h14M7 9h8M7 19h10"
              stroke="var(--color-bg)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Delivery
        </div>

        <p className="login-card__eyebrow">Staff Portal</p>
        <h1 className="login-card__title">Sign in to your account</h1>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="login-form__error" role="alert">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M8 5v3.5M8 10.5v.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {error}
            </div>
          )}

          <FormField
            label="Username"
            required
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your username"
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
            {loading ? (
              <>
                <span className="spinner" />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="login-card__back">
          <Link to="/">← Back to order form</Link>
        </div>
      </div>
    </div>
  );
}
