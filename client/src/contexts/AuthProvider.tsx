import { useState, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthUser } from '../types/auth';

const STORAGE_KEY = 'delivery_auth';

function loadStoredUser(): AuthUser | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed: AuthUser = JSON.parse(raw);
        if (new Date(parsed.expiresAt) <= new Date()) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(loadStoredUser);

    const signIn = useCallback((userData: AuthUser) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        setUser(userData);
    }, []);

    const signOut = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token: user?.token ?? null,
                signIn,
                signOut,
                isAuthenticated: !!user,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}