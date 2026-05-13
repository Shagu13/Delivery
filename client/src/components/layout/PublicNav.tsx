import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LanguageToggle } from '../ui/LanguageToggle';
import { useLanguage } from '../../contexts/useLanguage';
import { PriceCalculatorModal } from '../../pages/Home/PriceCalculatorModal';

export function PublicNav() {
    const { t } = useLanguage();
    const [calcOpen, setCalcOpen] = useState(false);

    return (
        <>
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
                        <button
                            className="nav__calc-btn"
                            onClick={() => setCalcOpen(true)}
                            title={t.calcTitle}
                            aria-label={t.calcTitle}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                                <path d="M7 8h10M7 12h5M7 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                                <path d="M15 13v6M12 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            </svg>
                        </button>
                        <Link to="/login" className="nav__link nav__link--cta">{t.navStaffLogin}</Link>
                    </nav>
                </div>
            </header>

            {calcOpen && <PriceCalculatorModal onClose={() => setCalcOpen(false)} />}

            <style>{`
                .nav__calc-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: var(--color-text-subtle);
                    padding: 6px;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: color var(--transition), background var(--transition);
                }
                .nav__calc-btn:hover {
                    color: var(--color-accent);
                    background: var(--color-accent-dim);
                }
            `}</style>
        </>
    );
}
