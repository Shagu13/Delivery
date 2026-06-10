import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LanguageToggle } from '../ui/LanguageToggle';
import { useLanguage } from '../../contexts/useLanguage';
import { PriceCalculatorModal } from '../../pages/Home/PriceCalculatorModal';
import { prefetchCalcData } from '../../pages/Home/calcDataCache';

export function PublicNav() {
    const { t } = useLanguage();
    const [menuOpen, setMenuOpen] = useState(false);
    const [calcOpen, setCalcOpen] = useState(false);
    const location = useLocation();

    // Prefetch calculator/tariff data so the homepage price cards fill instantly
    useEffect(() => { prefetchCalcData(); }, []);

    // Close drawer on route / anchor change
    useEffect(() => { setMenuOpen(false); }, [location.pathname, location.hash]);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        document.body.style.overflow = menuOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [menuOpen]);

    const navLinks = [
        { to: '/',          label: t.navHome },
        { to: '/#services', label: t.navServices },
        { to: '/#tariffs',  label: t.navTariffs },
        { to: '/#tracking', label: t.navTracking },
        { to: '/register',  label: t.navPartnership },
        { to: '/contact',   label: t.navContact },
    ];

    const isActive = (to: string) => {
        if (to === '/') return location.pathname === '/' && !location.hash;
        if (to.startsWith('/#')) return location.pathname === '/' && location.hash === to.slice(1);
        return location.pathname === to;
    };

    return (
        <>
            <header className="nav nav--public">
                <div className="nav__inner">
                    {/* Logo */}
                    <Link to="/" className="nav__logo nav__logo--dilo">
                        <img src="/dilo-logo-mark.png" alt="Dilo Delivery" className="nav__logo-img" />
                        <span className="nav__logo-script">Delivery</span>
                    </Link>

                    {/* ── Desktop nav ── */}
                    <nav className="nav__links nav__links--desktop nav__links--center">
                        {navLinks.map(l => (
                            <Link
                                key={l.to}
                                to={l.to}
                                className={`nav__link${isActive(l.to) ? ' nav__link--active' : ''}`}
                            >
                                {l.label}
                            </Link>
                        ))}
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
                    </nav>

                    <div className="nav__links nav__links--desktop">
                        <Link to="/send" className="nav__order-btn">{t.navPlaceOrder}</Link>
                        <Link to="/login" className="nav__profile-btn" title={t.navStaffLogin} aria-label={t.navStaffLogin}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6"/>
                                <circle cx="12" cy="9.5" r="3" stroke="currentColor" strokeWidth="1.6"/>
                                <path d="M5.5 19a7.5 7.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            </svg>
                        </Link>
                        <LanguageToggle />
                    </div>

                    {/* ── Mobile right side: lang + hamburger ── */}
                    <div className="nav__mobile-right">
                        <LanguageToggle />
                        <button
                            className="nav__hamburger"
                            onClick={() => setMenuOpen(o => !o)}
                            aria-label="Toggle menu"
                            aria-expanded={menuOpen}
                        >
                            {menuOpen ? (
                                /* X icon */
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            ) : (
                                /* Hamburger icon */
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Mobile drawer overlay ── */}
            {menuOpen && (
                <div className="nav__overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            )}
            <nav className={`nav__drawer${menuOpen ? ' nav__drawer--open' : ''}`} aria-hidden={!menuOpen}>
                <div className="nav__drawer-inner">
                    {navLinks.map(l => (
                        <Link
                            key={l.to}
                            to={l.to}
                            className="nav__drawer-link"
                            onClick={() => setMenuOpen(false)}
                        >
                            {l.label}
                        </Link>
                    ))}
                    <button
                        className="nav__drawer-calc"
                        onClick={() => { setMenuOpen(false); setCalcOpen(true); }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                            <path d="M7 8h10M7 12h5M7 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            <path d="M15 13v6M12 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                        {t.calcTitle}
                    </button>
                    <Link
                        to="/send"
                        className="nav__drawer-cta"
                        onClick={() => setMenuOpen(false)}
                    >
                        {t.navPlaceOrder}
                    </Link>
                    <Link
                        to="/login"
                        className="nav__drawer-link nav__drawer-link--login"
                        onClick={() => setMenuOpen(false)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6"/>
                            <circle cx="12" cy="9.5" r="3" stroke="currentColor" strokeWidth="1.6"/>
                            <path d="M5.5 19a7.5 7.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                        {t.navStaffLogin}
                    </Link>
                </div>
            </nav>

            {calcOpen && <PriceCalculatorModal onClose={() => setCalcOpen(false)} />}

            <style>{`
                /* ── Public nav: wider inner + centered links ── */
                .nav--public .nav__inner {
                    max-width: 1240px;
                }

                /* ── Calculator icon button ── */
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

                /* ── Drawer calculator entry ── */
                .nav__drawer-calc {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 14px 16px;
                    border-radius: var(--radius-md);
                    font-size: 1rem;
                    font-weight: 600;
                    font-family: var(--font-body);
                    color: var(--color-text);
                    background: none;
                    border: none;
                    cursor: pointer;
                    text-align: left;
                    transition: background var(--transition), color var(--transition);
                }
                .nav__drawer-calc:hover {
                    background: var(--color-bg-3);
                    color: var(--color-accent);
                }
                .nav--public .nav__links--center {
                    flex: 1;
                    justify-content: center;
                    gap: 4px;
                }
                .nav--public .nav__link--active {
                    color: var(--color-accent);
                }

                /* ── Dilo logo (image mark + script word) ── */
                .nav__logo--dilo {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0;
                    text-decoration: none;
                    flex-shrink: 0;
                }
                .nav__logo-img {
                    height: 26px;
                    width: auto;
                    display: block;
                }
                .nav__logo-script {
                    font-family: var(--font-display);
                    font-style: italic;
                    font-size: 0.6rem;
                    font-weight: 700;
                    letter-spacing: 0.22em;
                    color: var(--color-accent);
                    margin-top: 1px;
                    text-transform: capitalize;
                }

                /* ── Order CTA ── */
                .nav__order-btn {
                    display: inline-flex;
                    align-items: center;
                    background: var(--color-accent);
                    color: #fff;
                    border-radius: 10px;
                    padding: 9px 18px;
                    font-family: var(--font-body);
                    font-size: 0.82rem;
                    font-weight: 700;
                    text-decoration: none;
                    white-space: nowrap;
                    min-height: 38px;
                    transition: background 150ms, transform 150ms;
                    touch-action: manipulation;
                }
                .nav__order-btn:hover {
                    background: #dd9802;
                    transform: translateY(-1px);
                }

                /* ── Profile icon ── */
                .nav__profile-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    color: var(--color-text);
                    transition: color var(--transition), background var(--transition);
                }
                .nav__profile-btn:hover {
                    color: var(--color-accent);
                    background: var(--color-accent-dim);
                }

                /* ── Mobile right cluster ── */
                .nav__mobile-right {
                    display: none;
                    align-items: center;
                    gap: 8px;
                }

                /* ── Hamburger button ── */
                .nav__hamburger {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: var(--color-text);
                    padding: 8px;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 44px;
                    min-height: 44px;
                    transition: background var(--transition);
                }
                .nav__hamburger:hover { background: var(--color-bg-3); }

                /* ── Backdrop overlay ── */
                .nav__overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(26, 23, 20, 0.45);
                    z-index: 149;
                    animation: overlayIn 0.2s ease both;
                }
                @keyframes overlayIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }

                /* ── Slide-in drawer ── */
                .nav__drawer {
                    position: fixed;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    width: min(80vw, 300px);
                    background: var(--color-bg-2);
                    border-left: 1px solid var(--color-border);
                    box-shadow: -4px 0 24px rgba(0,0,0,0.12);
                    z-index: 150;
                    transform: translateX(100%);
                    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
                    display: flex;
                    flex-direction: column;
                    padding-top: env(safe-area-inset-top, 0px);
                }
                .nav__drawer--open {
                    transform: translateX(0);
                }
                .nav__drawer-inner {
                    display: flex;
                    flex-direction: column;
                    padding: 72px 20px 32px;
                    gap: 4px;
                    overflow-y: auto;
                    flex: 1;
                }
                .nav__drawer-link {
                    display: block;
                    padding: 14px 16px;
                    border-radius: var(--radius-md);
                    font-size: 1rem;
                    font-weight: 600;
                    font-family: var(--font-body);
                    color: var(--color-text);
                    text-decoration: none;
                    transition: background var(--transition), color var(--transition);
                }
                .nav__drawer-link:hover {
                    background: var(--color-bg-3);
                    color: var(--color-accent);
                }
                .nav__drawer-link--login {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .nav__drawer-cta {
                    display: block;
                    margin-top: 12px;
                    padding: 14px 16px;
                    border-radius: var(--radius-md);
                    font-size: 1rem;
                    font-weight: 700;
                    font-family: var(--font-body);
                    background: var(--color-accent);
                    color: #fff;
                    text-decoration: none;
                    text-align: center;
                    transition: opacity var(--transition);
                }
                .nav__drawer-cta:hover { opacity: 0.88; }

                /* ── Breakpoint: switch to mobile layout ── */
                @media (max-width: 900px) {
                    .nav--public .nav__links--desktop { display: none !important; }
                    .nav--public .nav__mobile-right   { display: flex !important; }
                }
            `}</style>
        </>
    );
}
