import { useEffect, useRef } from 'react';

/**
 * Calls `onResume` when the app returns to the foreground — i.e. the tab/PWA
 * becomes visible again after being backgrounded (courier opens Maps, takes a
 * call, locks the screen, then comes back).
 *
 * Why this exists: in a home-screen PWA a "warm resume" keeps React state alive
 * and SignalR pings that fired while backgrounded are never replayed, so the
 * lists can be stale until the next fetch. Re-fetching on resume guarantees the
 * courier always sees current data when they return to the app.
 *
 * Throttled: a resume that fires within `minIntervalMs` of the last run is
 * skipped, so rapid app-switching (and the focus/visibility events firing
 * together) doesn't spam the callback. The latest `onResume` is held in a ref,
 * so passing a fresh closure each render does not re-bind the listeners.
 */
export function useRefreshOnResume(onResume: () => void, minIntervalMs = 10_000): void {
    const cb = useRef(onResume);
    cb.current = onResume;
    const lastRun = useRef(0);

    useEffect(() => {
        const handler = () => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastRun.current < minIntervalMs) return;
            lastRun.current = now;
            cb.current();
        };
        document.addEventListener('visibilitychange', handler);
        window.addEventListener('focus', handler);
        return () => {
            document.removeEventListener('visibilitychange', handler);
            window.removeEventListener('focus', handler);
        };
    }, [minIntervalMs]);
}
