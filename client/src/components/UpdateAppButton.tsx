import { useState } from 'react';
import { useLanguage } from '../contexts/useLanguage';

/**
 * Force the installed PWA to drop its cached build and load the latest one.
 *
 * The app registers a cache-first service worker (vite-plugin-pwa), so an
 * installed home-screen PWA keeps serving the previously precached
 * `index.html` + assets even after a new version is deployed — a plain reload
 * is intercepted by the worker and returns the stale shell. To guarantee the
 * newest build we unregister every service worker, delete all Cache Storage
 * entries, then reload the document with a cache-busting query so the browser
 * fetches a fresh `index.html` (which then re-registers a new worker that
 * precaches the new assets).
 */
export async function forceUpdateApp(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {
    // Best-effort cleanup — reload regardless so the user still gets a refresh.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_u', Date.now().toString());
  window.location.replace(url.toString());
}

export function UpdateAppButton({ className = 'update-app-btn' }: { className?: string }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      title={t.pwaUpdateHint}
      onClick={() => { setBusy(true); void forceUpdateApp(); }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 8a6 6 0 1 0 1.6-4.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2 2.5v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {busy ? t.pwaUpdating : t.pwaUpdateButton}
    </button>
  );
}
