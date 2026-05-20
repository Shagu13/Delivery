import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { fetchGroupOrders } from '../../api/adminGroupOrders';
import { LanguageToggle } from '../ui/LanguageToggle';

function usePendingCount(token: string | null, isAdmin: boolean) {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        if (!isAdmin || !token) return;
        let cancelled = false;
        const load = async () => {
            try {
                const orders = await fetchGroupOrders(token);
                if (!cancelled) setCount(orders.filter(o => o.status === 'Pending').length);
            } catch { /* silently ignore */ }
        };
        void load();
        const interval = setInterval(() => void load(), 30_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [token, isAdmin]);

    return count;
}

export function StaffNav() {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'Admin';
    const pendingCount = usePendingCount(token ?? null, isAdmin);

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
                    {isAdmin && (
                        <button
                            className="nav__pending-btn"
                            onClick={() => navigate('/admin?tab=orders&status=Pending')}
                            aria-label={`Pending group orders${pendingCount !== null ? `: ${pendingCount}` : ''}`}
                            title="View pending group orders"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
                                <polyline points="3.29 7 12 12 20.71 7" />
                                <line x1="12" y1="22" x2="12" y2="12" />
                            </svg>
                            {pendingCount !== null && pendingCount > 0 && (
                                <span className="nav__pending-badge">
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                </span>
                            )}
                        </button>
                    )}
                    {user?.role !== 'Courier' && <span className="nav__user">{user?.username}</span>}
                </nav>
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
