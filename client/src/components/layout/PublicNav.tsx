import { Link } from 'react-router-dom';
import { LanguageToggle } from '../ui/LanguageToggle';
import { useLanguage } from '../../contexts/useLanguage';

export function PublicNav() {
    const { t } = useLanguage();

    return (
        <header className="nav">
            <div className="nav__inner">
                <Link to="/" className="nav__logo">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <rect width="28" height="28" rx="6" fill="currentColor" />
                        <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>{t.appName}</span>
                </Link>
                <nav className="nav__links">
                    <LanguageToggle />
                    <Link to="/"        className="nav__link">{t.navHome}</Link>
                    <Link to="/send"    className="nav__link">{t.navSendPackages}</Link>
                    <Link to="/register" className="nav__link">{t.navRegister}</Link>
                    <Link to="/login"   className="nav__link nav__link--cta">{t.navStaffLogin}</Link>
                </nav>
            </div>
        </header>
    );
}
