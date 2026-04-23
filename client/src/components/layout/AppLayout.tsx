import { useAuth } from '../../contexts/useAuth';
import { PublicNav } from './PublicNav';
import { StaffNav } from './StaffNav';
import './layout.css';

interface AppLayoutProps {
    children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
    const { user } = useAuth();

    return (
        <div className="app-layout">
            {user ? <StaffNav /> : <PublicNav />}
            <main className="app-layout__main">
                {children}
            </main>
        </div>
    );
}