// Automatic PWA updates.
//
// The app registers a cache-first service worker (vite-plugin-pwa, autoUpdate).
// With `skipWaiting` + `clientsClaim` a freshly deployed worker activates and
// takes control on its own, but the page that is already open is NOT reloaded —
// so an installed home-screen PWA keeps showing the stale cached shell until it
// is relaunched. This wires up the missing piece: reload the page once, the
// moment the updated worker takes control, and proactively check for new builds
// on launch / focus / periodically so the update is picked up promptly.
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
    reloading = true;
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
