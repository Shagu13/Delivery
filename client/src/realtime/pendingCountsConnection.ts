import * as signalR from '@microsoft/signalr';

/** Admin staff-nav badge counts, pushed live from the backend over SignalR. */
export interface PendingCounts {
    pendingGroupOrders: number;
    returnExchange: number;
}

type Listener = (counts: PendingCounts) => void;

const EMPTY: PendingCounts = { pendingGroupOrders: 0, returnExchange: 0 };

// One shared hub connection for the whole app, ref-counted across subscribers,
// so StaffNav and AdminDashboard don't each open their own socket.
let connection: signalR.HubConnection | null = null;
let refCount = 0;
let latest: PendingCounts = EMPTY;
const listeners = new Set<Listener>();

/**
 * Subscribe to live pending counts. Opens the hub connection on the first
 * subscriber and closes it when the last one leaves. The listener is invoked
 * immediately with the last known value, then again on every server push.
 * Returns an unsubscribe function.
 */
export function subscribePendingCounts(token: string, listener: Listener): () => void {
    listeners.add(listener);
    listener(latest);

    if (!connection) {
        connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/notifications', { accessTokenFactory: () => token })
            .withAutomaticReconnect()
            .build();

        connection.on('pendingCounts', (counts: PendingCounts) => {
            latest = counts;
            listeners.forEach(l => l(counts));
        });

        // Best-effort: if the socket can't open the badges just stay at their
        // last known value rather than crashing the nav.
        connection.start().catch(() => { /* ignore */ });
    }
    refCount++;

    return () => {
        listeners.delete(listener);
        refCount--;
        if (refCount === 0 && connection) {
            const closing = connection;
            connection = null;
            latest = EMPTY;
            void closing.stop();
        }
    };
}
