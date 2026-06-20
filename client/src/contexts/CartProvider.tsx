import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { CartContext } from './CartContext';
import type { CartItem, CartSender, CartContextValue } from './CartContext';
import type { OrderItemRequest } from '../types/groupOrder';

// Cart is scoped per customer so two accounts on one browser don't share a cart.
const KEY_PREFIX = 'delivery_cart_';

interface Persisted {
    items: CartItem[];
    sender: CartSender | null;
}

function makeId(): string {
    return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const key = `${KEY_PREFIX}${user?.customerId ?? 'guest'}`;

    const [items, setItems] = useState<CartItem[]>([]);
    const [sender, setSender] = useState<CartSender | null>(null);

    // Hydrate whenever the active customer (and thus the storage key) changes.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? (JSON.parse(raw) as Persisted) : null;
            setItems(parsed?.items ?? []);
            setSender(parsed?.sender ?? null);
        } catch {
            setItems([]);
            setSender(null);
        }
    }, [key]);

    // Writes happen explicitly in the mutators (not via an effect on `items`) so a
    // key change can't race the persist effect and clobber the new cart with the old.
    const write = useCallback((nextItems: CartItem[], nextSender: CartSender | null) => {
        try {
            localStorage.setItem(key, JSON.stringify({ items: nextItems, sender: nextSender } satisfies Persisted));
        } catch { /* storage unavailable — keep in memory */ }
    }, [key]);

    const addItems = useCallback((newItems: OrderItemRequest[], snd: CartSender) => {
        setItems(prev => {
            const next = [...prev, ...newItems.map(i => ({ ...i, clientId: makeId() }))];
            write(next, snd);
            return next;
        });
        setSender(snd);
    }, [write]);

    const removeItem = useCallback((clientId: string) => {
        setItems(prev => {
            const next = prev.filter(i => i.clientId !== clientId);
            write(next, sender);
            return next;
        });
    }, [write, sender]);

    const clear = useCallback(() => {
        setItems([]);
        setSender(null);
        write([], null);
    }, [write]);

    const value = useMemo<CartContextValue>(() => ({
        items, count: items.length, sender, addItems, removeItem, clear,
    }), [items, sender, addItems, removeItem, clear]);

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
