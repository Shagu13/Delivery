import '../Login/login.css';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="login-form__error" role="alert">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {message}
    </div>
  );
}
