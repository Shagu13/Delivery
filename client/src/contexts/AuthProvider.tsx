import { useState, useCallback, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthUser } from '../types/auth';
import { queryClient, persister } from '../queryClient';

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

/** The bearer token a fetch call carries, or null when it is not an authenticated /api call. */
function bearerTokenOf(input: RequestInfo | URL, init?: RequestInit): string | null {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (!url.startsWith('/api/')) return null;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const auth = headers.get('Authorization');
    return auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(loadStoredUser);

    const signIn = useCallback((userData: AuthUser) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        setUser(userData);
    }, []);

    const signOut = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        // Drop the HttpOnly SignalR hub-auth cookie (JS can't clear it itself).
        fetch('/api/auth/hub-cookie', { method: 'DELETE' }).catch(() => { /* ignore */ });
        // Wipe the in-memory and persisted query cache so the next login on this device
        // (a different admin, or a shared machine) doesn't flash this user's cached data.
        queryClient.clear();
        void persister.removeClient();
        setUser(null);
    }, []);

    // Server-side session revocation: the API answers 401 to a token that is no longer valid
    // (e.g. an Admin whose password was reset by the system admin). Every api/*.ts call goes
    // through fetch, so one wrapper here signs the user out instead of each call handling it.
    // Only a 401 for the *current* session's token counts, so a late response to a request
    // sent before a re-login can't sign the new session out.
    useEffect(() => {
        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
            const response = await originalFetch(input, init);
            if (response.status === 401) {
                const sent = bearerTokenOf(input, init);
                if (sent && sent === loadStoredUser()?.token) signOut();
            }
            return response;
        };
        return () => { window.fetch = originalFetch; };
    }, [signOut]);

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