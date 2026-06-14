'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cartApi } from '@wholo/api-client';
import type { CartItem } from '@wholo/types';
import { useAuth } from './auth-context';

interface CartContextValue {
  cartLoading: boolean;
  cartCount: number;
  items: CartItem[];
  quantities: Record<string, number>;
  inCart: Set<string>;
  savingItems: Set<string>;
  adjustQty: (productId: string, delta: number) => void;
  syncItem: (productId: string, quantity: number) => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  distributorSlug,
  children,
}: {
  distributorSlug: string;
  children: React.ReactNode;
}) {
  const { user, accessToken } = useAuth();
  const [cartLoading, setCartLoading] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inCart, setInCart] = useState<Set<string>>(new Set());
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());

  const reconcile = useCallback((cartItems: CartItem[]) => {
    const qtys: Record<string, number> = {};
    const ids = new Set<string>();
    for (const item of cartItems) {
      qtys[item.productId] = item.quantity;
      ids.add(item.productId);
    }
    setItems(cartItems);
    setQuantities(qtys);
    setInCart(ids);
  }, []);

  useEffect(() => {
    if (!user || !accessToken) {
      setCartLoading(false);
      return;
    }
    setCartLoading(true);
    cartApi
      .getCart(distributorSlug, accessToken)
      .then((cart) => reconcile(cart.items))
      .catch(() => {})
      .finally(() => setCartLoading(false));
  }, [distributorSlug, user, accessToken, reconcile]);

  const adjustQty = useCallback((productId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] ?? 1) + delta),
    }));
  }, []);

  const syncItem = useCallback(
    async (productId: string, quantity: number) => {
      if (!accessToken) return;
      setSavingItems((prev) => new Set([...prev, productId]));

      setInCart((prev) => new Set([...prev, productId]));
      setQuantities((prev) => ({ ...prev, [productId]: quantity }));

      try {
        const cart = await cartApi.upsertItem({ distributorSlug, productId, quantity }, accessToken);
        reconcile(cart.items);
      } catch {
        setInCart((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      } finally {
        setSavingItems((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [accessToken, distributorSlug, reconcile],
  );

  const refreshCart = useCallback(async () => {
    if (!accessToken) return;
    const cart = await cartApi.getCart(distributorSlug, accessToken);
    reconcile(cart.items);
  }, [accessToken, distributorSlug, reconcile]);

  const cartCount = [...inCart].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  return (
    <CartContext.Provider value={{ cartLoading, cartCount, items, quantities, inCart, savingItems, adjustQty, syncItem, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
