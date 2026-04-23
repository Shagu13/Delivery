import { Link } from 'react-router-dom';

export function PublicNav() {
    return (
        <header className="nav">
            <div className="nav__inner">
                <Link to="/" className="nav__logo">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <rect width="28" height="28" rx="6" fill="currentColor" />
                        <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>Delivery</span>
                </Link>
                <nav className="nav__links">
                    <Link to="/" className="nav__link">Home</Link>
                    <Link to="/send" className="nav__link">Send Packages</Link>
                    <Link to="/register" className="nav__link">Register</Link>
                    <Link to="/login" className="nav__link nav__link--cta">Staff Login</Link>
                </nav>
            </div>
        </header>
    );
}