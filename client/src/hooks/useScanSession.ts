import { useCallback, useState } from 'react';
import type { ScannedOrder } from '../api/scan';

// The in-progress scan list, kept in localStorage so a refresh or an accidental tab close
// doesn't lose a half-scanned batch. Same hand-rolled try/catch pattern as useWalkInDrafts.
const KEY = 'delivery_scan_session';

function read(): ScannedOrder[] {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as ScannedOrder[]) : [];
    } catch {
        return [];
    }
}

function write(items: ScannedOrder[]): void {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable — list stays in memory */ }
}

export function useScanSession() {
    const [items, setItems] = useState<ScannedOrder[]>(read);

    const has = useCallback(
        (trackingNumber: string) => items.some(i => i.trackingNumber === trackingNumber.trim().toUpperCase()),
        [items],
    );

    const add = useCallback((order: ScannedOrder) => {
        setItems(prev => {
            if (prev.some(i => i.orderId === order.orderId)) return prev;
            const next = [order, ...prev];
            write(next);
            return next;
        });
    }, []);

    const remove = useCallback((orderId: string) => {
        setItems(prev => {
            const next = prev.filter(i => i.orderId !== orderId);
            write(next);
            return next;
        });
    }, []);

    const clear = useCallback(() => {
        setItems([]);
        write([]);
    }, []);

    return { items, has, add, remove, clear };
}
