import { createContext } from 'react';
import type { OrderItemRequest } from '../types/groupOrder';

/** Sender + pickup snapshot captured when packages are added to the cart. */
export interface CartSender {
    senderFirstName: string;
    senderLastName: string;
    senderIdNumber?: string;
    senderBusinessName: string;
    senderPhone: string;
    alternativeSenderPhone?: string;
    pickUpCity: string;
    pickUpDistrict: string;
    pickUpAddress: string;
    note?: string;
}

/** One package waiting in the cart — an order payload plus a stable client id. */
export interface CartItem extends OrderItemRequest {
    clientId: string;
}

export interface CartContextValue {
    items: CartItem[];
    count: number;
    sender: CartSender | null;
    addItems: (items: OrderItemRequest[], sender: CartSender) => void;
    /** Adds `adds` as new cart items and overwrites existing items by clientId (`updates`) in one
     *  write. Returns the clientIds assigned to `adds`, in order. */
    saveItems: (adds: OrderItemRequest[], updates: Record<string, OrderItemRequest>, sender: CartSender) => string[];
    removeItem: (clientId: string) => void;
    clear: () => void;
}

export const CartContext = createContext<CartContextValue | null>(null);
