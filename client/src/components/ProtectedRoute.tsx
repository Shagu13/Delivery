import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import type { UserRole } from '../types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Single role or any-of list. Omit to allow any authenticated user. */
  role?: UserRole | UserRole[];
}

// Where each role's dashboard lives. Admin and Operator share the /admin app
// (Operator sees a restricted subset of it).
export function homeFor(role?: UserRole): string {
  switch (role) {
    case 'Admin':
    case 'Operator':    return '/admin';
    case 'Customer':    return '/customer';
    case 'TenantAdmin': return '/tenant';
    default:            return '/courier';
  }
}

export function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Preserve where they were trying to go so we can redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const allowed = role === undefined
    || (Array.isArray(role) ? role.includes(user!.role) : user!.role === role);

  if (!allowed) {
    // Authenticated but wrong role — send to their own dashboard
    return <Navigate to={homeFor(user?.role)} replace />;
  }

  return <>{children}</>;
}
