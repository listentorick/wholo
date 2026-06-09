'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cartApi } from '@wholo/api-client';
import { useAuth } from './auth-context';

interface CartContextValue {
  cartCount: number;
  quantities: Record<string, number>;
  inCart: Set<string>;
  savingItems: Set<string>;
  adjustQty: (productId: string, delta: number) => void;
  syncItem: (productId: string, quantity: number) => Promise<void>;
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
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inCart, setInCart] = useState<Set<string>>(new Set());
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !accessToken) return;
    cartApi
      .getCart(distributorSlug, accessToken)
      .then((cart) => {
        const qtys: Record<string, number> = {};
        const ids = new Set<string>();
        for (const item of cart.items) {
          qtys[item.productId] = item.quantity;
          ids.add(item.productId);
        }
        setQuantities(qtys);
        setInCart(ids);
      })
      .catch(() => {});
  }, [distributorSlug, user, accessToken]);

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
        const qtys: Record<string, number> = {};
        const ids = new Set<string>();
        for (const item of cart.items) {
          qtys[item.productId] = item.quantity;
          ids.add(item.productId);
        }
        setQuantities((prev) => ({ ...prev, ...qtys }));
        setInCart(ids);
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
    [accessToken, distributorSlug],
  );

  const cartCount = [...inCart].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  return (
    <CartContext.Provider value={{ cartCount, quantities, inCart, savingItems, adjustQty, syncItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
