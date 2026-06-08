import * as signalR from '@microsoft/signalr';

/** Admin staff-nav badge counts, pushed live from the backend over SignalR. */
export interface PendingCounts {
    pendingGroupOrders: number;
    returnExchange: number;
}

/** Server → client event names carried on the shared notifications hub. */
export type HubEvent = 'pendingCounts' | 'adminOrdersChanged' | 'courierOrdersChanged';

type Handler = (payload: unknown) => void;

const EMPTY: PendingCounts = { pendingGroupOrders: 0, returnExchange: 0 };

// One shared hub connection for the whole app, ref-counted across subscribers, so the
// StaffNav, AdminDashboard, and CourierDashboard don't each open their own socket.
let connection: signalR.HubConnection | null = null;
let refCount = 0;
let latestPendingCounts: PendingCounts = EMPTY;

// event name → set of handlers, and the set of events already wired with connection.on().
const handlers = new Map<HubEvent, Set<Handler>>();
const boundEvents = new Set<HubEvent>();

function bindEvent(event: HubEvent) {
    if (!connection || boundEvents.has(event)) return;
    boundEvents.add(event);
    connection.on(event, (payload: unknown) => {
        if (event === 'pendingCounts') latestPendingCounts = payload as PendingCounts;
        handlers.get(event)?.forEach(h => h(payload));
    });
}

function ensureConnection(token: string) {
    if (connection) return;
    // No accessTokenFactory: that would append ?access_token=<jwt> to the hub URL.
    // Instead we set an HttpOnly "hubToken" cookie (scoped to /hubs) and let the
    // browser carry it on the handshake, keeping the token out of the URL.
    connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/notifications')
        .withAutomaticReconnect()
        .build();

    // (Re)wire handlers for every event that already has subscribers.
    boundEvents.clear();
    handlers.forEach((_set, event) => bindEvent(event));

    // Install the hub-auth cookie first (a normal fetch *can* send the Bearer header),
    // then open the socket. Best-effort: if either step fails the UI just stays at its
    // last known state rather than crashing.
    fetch('/api/auth/hub-cookie', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    })
        .then(() => connection?.start())
        .catch(() => { /* ignore */ });
}

function subscribe(token: string, event: HubEvent, handler: Handler): () => void {
    let set = handlers.get(event);
    if (!set) { set = new Set(); handlers.set(event, set); }
    set.add(handler);

    ensureConnection(token);
    bindEvent(event); // no-op if the connection was just created (already bound) or not yet open
    refCount++;

    return () => {
        set!.delete(handler);
        refCount--;
        if (refCount === 0 && connection) {
            const closing = connection;
            connection = null;
            boundEvents.clear();
            latestPendingCounts = EMPTY;
            void closing.stop();
        }
    };
}

/**
 * Subscribe to live pending counts. The listener is invoked immediately with the last
 * known value, then again on every server push. Returns an unsubscribe function.
 */
export function subscribePendingCounts(
    token: string,
    listener: (counts: PendingCounts) => void,
): () => void {
    listener(latestPendingCounts);
    return subscribe(token, 'pendingCounts', p => listener(p as PendingCounts));
}

/**
 * Subscribe to an "orders changed — refetch" ping. The backend sends 'adminOrdersChanged'
 * to admins and 'courierOrdersChanged' to the assigned courier. Returns an unsubscribe fn.
 */
export function subscribeOrdersChanged(
    token: string,
    event: 'adminOrdersChanged' | 'courierOrdersChanged',
    listener: () => void,
): () => void {
    return subscribe(token, event, () => listener());
}
