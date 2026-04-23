import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}

export function withAuth(token: string, init: RequestInit = {}): RequestInit {
    return {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init.headers,
            Authorization: `Bearer ${token}`,
        },
    };
}