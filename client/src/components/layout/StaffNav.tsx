import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useCart } from '../../contexts/useCart';
import { useLanguage } from '../../contexts/useLanguage';
import { useAdminPendingCounts } from '../../realtime/useAdminPendingCounts';
import { LanguageToggle } from '../ui/LanguageToggle';
import { WalkInDraftsMenu } from './WalkInDraftsMenu';

export function StaffNav() {
    const { user, token } = useAuth();
    const { t } = useLanguage();
    const { count: cartCount } = useCart();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'Admin';
    const isOperator = user?.role === 'Operator';
    const isCustomer = user?.role === 'Customer';
    const { pendingGroupOrders: pendingCount, returnExchange: returnExchangeCount } =
        useAdminPendingCounts(token ?? null, isAdmin);

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
                    <LanguageToggle />
                    {(isAdmin || isOperator) && <WalkInDraftsMenu />}
                    {isAdmin && (
                        <button
                            className="nav__pending-btn"
                            onClick={() => navigate('/admin?tab=orders&status=Pending')}
                            aria-label={`Pending group orders: ${pendingCount}`}
                            title="View pending group orders"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
                                <polyline points="3.29 7 12 12 20.71 7" />
                                <line x1="12" y1="22" x2="12" y2="12" />
                            </svg>
                            {pendingCount > 0 && (
                                <span className="nav__pending-badge">
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                </span>
                            )}
                        </button>
                    )}
                    {isAdmin && returnExchangeCount > 0 && (
                        <button
                            className="nav__pending-btn"
                            onClick={() => navigate('/admin?view=returnExchange')}
                            aria-label={`Return & Exchange orders: ${returnExchangeCount}`}
                            title="View return & exchange orders"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                <path d="M3 3v5h5"/>
                            </svg>
                            <span className="nav__pending-badge">
                                {returnExchangeCount > 99 ? '99+' : returnExchangeCount}
                            </span>
                        </button>
                    )}
                    {isCustomer && (
                        <button
                            className="nav__pending-btn"
                            onClick={() => navigate('/cart')}
                            aria-label={`${t.cartTitle}: ${cartCount}`}
                            title={t.cartTitle}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="9" cy="21" r="1" />
                                <circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                            </svg>
                            {cartCount > 0 && (
                                <span className="nav__pending-badge nav__cart-badge">
                                    {cartCount > 99 ? '99+' : cartCount}
                                </span>
                            )}
                        </button>
                    )}
                </nav>
                {user?.role !== 'Courier' && <span className="nav__user">{user?.username}</span>}
            </div>

            <style>{`
                .nav__pending-btn {
                    position: relative;
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
                .nav__pending-btn:hover {
                    color: var(--color-text);
                    background: var(--color-bg-3);
                }
                .nav__cart-badge {
                    background: var(--color-accent) !important;
                }
                .nav__pending-badge {
                    position: absolute;
                    top: 0px;
                    right: 0px;
                    background: #ef4444;
                    color: #fff;
                    font-size: 0.58rem;
                    font-weight: 800;
                    line-height: 1;
                    padding: 2px 4px;
                    border-radius: 100px;
                    min-width: 16px;
                    text-align: center;
                    border: 1.5px solid var(--color-bg);
                    pointer-events: none;
                }
            `}</style>
        </header>
    );
}
