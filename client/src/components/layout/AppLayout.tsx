import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { PublicNav } from './PublicNav';
import { StaffNav } from './StaffNav';
import './layout.css';

// Pages where an authenticated user should be bounced to their dashboard.
// /send is intentionally NOT here — logged-in customers are allowed there.
const REDIRECT_IF_AUTHED = ['/', '/login', '/register'];

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

    return (
        <div className="app-layout">
            {user ? <StaffNav /> : <PublicNav />}
            <main className="app-layout__main">
                {children}
            </main>
        </div>
    );
}
