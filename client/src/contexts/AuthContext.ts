import { createContext } from 'react';
import type { AuthUser } from '../types/auth';

export interface AuthContextValue {
    user: AuthUser | null;
    token: string | null;
    signIn: (user: AuthUser) => void;
    signOut: () => void;
    isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);