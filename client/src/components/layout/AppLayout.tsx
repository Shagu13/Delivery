import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { PublicNav } from './PublicNav';
import { StaffNav } from './StaffNav';
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

        const shouldRedirect = REDIRECT_IF_AUTHED.includes(location.pathname);
        if (!shouldRedirect) return;

        const dest =
            user.role === 'Admin'    ? '/admin'    :
            user.role === 'Customer' ? '/customer' : '/courier';

        navigate(dest, { replace: true });
    }, [isAuthenticated, user, location.pathname, navigate]);

    const hideStaffNav = SELF_SHELLED_PREFIXES.some(p => location.pathname.startsWith(p));

    return (
        <div className="app-layout">
            {!user ? <PublicNav /> : hideStaffNav ? null : <StaffNav />}
            <main className="app-layout__main">
                {children}
            </main>
        </div>
    );
}
