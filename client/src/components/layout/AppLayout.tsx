import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { PublicNav } from './PublicNav';
import { StaffNav } from './StaffNav';
import { isLivoHost } from '../../pages/Tenant/livoHost';
import './layout.css';

// Pages where an authenticated user should be bounced to their dashboard.
// /send is intentionally NOT here — logged-in customers are allowed there.
const REDIRECT_IF_AUTHED = ['/', '/login', '/register'];

// Routes whose page renders its own self-contained shell (own logo + sidebar /
// mobile top bar). StaffNav would stack a second navbar with a duplicate
// "Delivery" logo on top of them, so it is suppressed here. Admin has no shell
// of its own and relies on StaffNav, so it is intentionally not listed.
const SELF_SHELLED_PREFIXES = ['/customer', '/courier'];

interface AppLayoutProps {
    children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
    const { user, isAuthenticated } = useAuth();
    const navigate  = useNavigate();
    const location  = useLocation();

    useEffect(() => {
        if (!isAuthenticated || !user) return;

        // A tenant co-admin is allowed to stay on "/" so they can view their own
        // storefront preview there; only bounce them off /login and /register.
        const shouldRedirect = REDIRECT_IF_AUTHED.includes(location.pathname)
            && !(user.role === 'TenantAdmin' && location.pathname === '/');
        if (!shouldRedirect) return;

        const dest =
            user.role === 'Admin' || user.role === 'Operator' || user.role === 'TenantAdmin' ? '/admin' :
            user.role === 'Customer' ? '/customer' : '/courier';

        navigate(dest, { replace: true });
    }, [isAuthenticated, user, location.pathname, navigate]);

    const hideStaffNav = SELF_SHELLED_PREFIXES.some(p => location.pathname.startsWith(p));

    // The LivoExpress homepage renders its own self-contained nav (logo + account),
    // so suppress the default public/staff nav there. This applies on the livo host
    // itself and in the logged-in co-admin preview (a TenantAdmin viewing "/").
    const isTenantOwnHome = location.pathname === '/'
        && (isLivoHost(window.location.hostname) || user?.role === 'TenantAdmin');

    return (
        <div className="app-layout">
            {isTenantOwnHome ? null : !user ? <PublicNav /> : hideStaffNav ? null : <StaffNav />}
            <main className="app-layout__main">
                {children}
            </main>
        </div>
    );
}
