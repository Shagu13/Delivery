/* eslint-disable */
// Imported into the generated Workbox service worker (see vite.config → workbox.importScripts).
// Handles Web Push "new order" messages so couriers are alerted even when the PWA is closed /
// the phone is locked. Runs in the service-worker global scope.

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: (event.data && event.data.text && event.data.text()) || '' };
    }
    const title = data.title || 'ახალი შეკვეთა · New order';
    const options = {
        body: data.body || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: data.tag || 'dilo-new-order',
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 120, 300],
        data: { url: data.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of all) {
            if ('focus' in client) {
                try { if ('navigate' in client) await client.navigate(targetUrl); } catch (e) { /* ignore */ }
                return client.focus();
            }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })());
});
