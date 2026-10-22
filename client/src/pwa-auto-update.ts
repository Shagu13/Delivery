// Automatic PWA updates.
//
// The app registers a cache-first service worker (vite-plugin-pwa, autoUpdate).
// With `skipWaiting` + `clientsClaim` a freshly deployed worker activates and
// takes control on its own, but the page that is already open is NOT reloaded —
// so an installed home-screen PWA keeps showing the stale cached shell until it
// is relaunched. This wires up the missing piece: reload the page once, the
// moment the updated worker takes control, and proactively check for new builds
// on launch / focus / periodically so the update is picked up promptly.
//
// Loop guard: `reloading` resets on every reload, so if the browser keeps seeing
// the worker as "changed" (mid-deploy instance mismatch, unstable imported
// script) the page would reload forever. The last auto-reload time is kept in
// sessionStorage and a second reload within the cooldown is skipped — the new
// worker still controls the page, it just isn't force-reloaded again.
const RELOAD_KEY = 'pwa_last_auto_reload';
const RELOAD_COOLDOWN_MS = 60 * 1000;

function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    return last > 0 && Date.now() - last < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try { sessionStorage.setItem(RELOAD_KEY, Date.now().toString()); } catch { /* storage blocked */ }
}

export function setupPwaAutoUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  let reloading = false;
  // Whether a worker already controls this page. The first controller a page
  // ever gets is the initial install on a fresh visit — that must NOT trigger a
  // reload; only a *replacement* (an update) should.
  let hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    if (!hadController) { hadController = true; return; }
    if (reloadedRecently()) return;
    reloading = true;
    markReloaded();
    window.location.reload();
  });

  navigator.serviceWorker.ready
    .then(reg => {
      const check = () => { reg.update().catch(() => {}); };
      check(); // on launch
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check(); // on focus/resume
      });
      window.setInterval(check, 30 * 60 * 1000); // hourly-ish while open
    })
    .catch(() => { /* no registration yet — nothing to do */ });
}
