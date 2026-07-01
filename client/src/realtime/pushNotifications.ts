// Web Push subscription for couriers — registers the device with the backend so "new order"
// pushes arrive even when the PWA is closed / phone locked. Safe no-op where unsupported.

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized);
    // Allocate over a concrete ArrayBuffer so the result is a valid BufferSource
    // (avoids the Uint8Array<ArrayBufferLike> vs ArrayBuffer mismatch on TS 5.7+).
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function bufToBase64Url(buf: ArrayBuffer | null): string {
    if (!buf) return '';
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIos(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        // iPadOS 13+ reports as Mac; detect the touch-capable "Mac".
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export type EnablePushResult = 'granted' | 'denied' | 'unsupported' | 'not-configured' | 'error';

/**
 * Ensure a push subscription exists and is registered server-side. Must be called from a user
 * gesture the first time (browser rule, and required on iOS). Idempotent afterwards.
 */
export async function enablePush(token: string): Promise<EnablePushResult> {
    if (!pushSupported()) return 'unsupported';
    try {
        let perm = Notification.permission;
        if (perm === 'default') perm = await Notification.requestPermission();
        if (perm !== 'granted') return 'denied';

        const reg = await navigator.serviceWorker.ready;

        const res = await fetch('/api/push/vapid-public-key', { headers: { Authorization: `Bearer ${token}` } });
        const publicKey: string | null = res.ok ? (await res.json()).publicKey : null;
        if (!publicKey) return 'not-configured';

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }

        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                endpoint: sub.endpoint,
                p256dh: bufToBase64Url(sub.getKey('p256dh')),
                auth: bufToBase64Url(sub.getKey('auth')),
            }),
        });
        return 'granted';
    } catch {
        return 'error';
    }
}
