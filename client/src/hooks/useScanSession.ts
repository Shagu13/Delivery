import { useCallback, useState } from 'react';
import type { ScannedOrder } from '../api/scan';

// The in-progress scan list, kept in localStorage so a refresh or an accidental tab close
// doesn't lose a half-scanned batch. Same hand-rolled try/catch pattern as useWalkInDrafts.
export const MANIFEST_SESSION_KEY = 'delivery_scan_session';
export const ASSIGN_SESSION_KEY = 'delivery_scan_assign_session';

function read(key: string): ScannedOrder[] {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as ScannedOrder[]) : [];
    } catch {
        return [];
    }
}

function write(key: string, items: ScannedOrder[]): void {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage unavailable — list stays in memory */ }
}

/** One persisted scan list per localStorage `key` — Manifest and Assign modes each keep their own. */
export function useScanSession(key: string = MANIFEST_SESSION_KEY) {
    const [items, setItems] = useState<ScannedOrder[]>(() => read(key));

    const has = useCallback(
        (trackingNumber: string) => items.some(i => i.trackingNumber === trackingNumber.trim().toUpperCase()),
        [items],
    );

    const add = useCallback((order: ScannedOrder) => {
        setItems(prev => {
            if (prev.some(i => i.orderId === order.orderId)) return prev;
            const next = [order, ...prev];
            write(key, next);
            return next;
        });
    }, [key]);

    const removeMany = useCallback((orderIds: string[]) => {
        setItems(prev => {
            const next = prev.filter(i => !orderIds.includes(i.orderId));
            write(key, next);
            return next;
        });
    }, [key]);

    const remove = useCallback((orderId: string) => removeMany([orderId]), [removeMany]);

    const clear = useCallback(() => {
        setItems([]);
        write(key, []);
    }, [key]);

    return { items, has, add, remove, removeMany, clear };
}
