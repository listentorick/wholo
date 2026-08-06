'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cartApi } from '@wholo/api-client';
import { TradeRelationshipStatus, type CartItem, type CartResponse } from '@wholo/types';
import { useAuth } from './auth-context';
import { useDistributor } from './distributor-context';

interface CartContextValue {
  cartLoading: boolean;
  cartCount: number;
  subtotal: number;
  taxAmount: number;
  taxLabel: string;
  total: number;
  items: CartItem[];
  quantities: Record<string, number>;
  inCart: Set<string>;
  savingItems: Set<string>;
  adjustQty: (productId: string, delta: number) => void;
  syncItem: (productId: string, quantity: number) => Promise<void>;
  refreshCart: () => Promise<void>;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  distributorSlug,
  children,
}: {
  distributorSlug: string;
  children: React.ReactNode;
}) {
  const { user, accessToken } = useAuth();
  const { relationshipStatus } = useDistributor();
  const [cartLoading, setCartLoading] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inCart, setInCart] = useState<Set<string>>(new Set());
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  // Tax/total come straight from the API's own calculateLineTax-derived
  // figures (CartService.formatCart) — never recomputed here. There must be
  // exactly one implementation of the tax calculation, and it lives server-side.
  const [serverTotals, setServerTotals] = useState({ taxAmount: 0, total: 0, taxLabel: 'Tax' });

  const reconcile = useCallback((cart: CartResponse) => {
    const qtys: Record<string, number> = {};
    const ids = new Set<string>();
    for (const item of cart.items) {
      qtys[item.productId] = item.quantity;
      ids.add(item.productId);
    }
    setItems(cart.items);
    setQuantities(qtys);
    setInCart(ids);
    setServerTotals({ taxAmount: parseFloat(cart.taxAmount), total: parseFloat(cart.total), taxLabel: cart.taxLabel });
  }, []);

  useEffect(() => {
    if (!user || !accessToken) {
      setCartLoading(false);
      return;
    }
    setCartLoading(true);
    cartApi
      .getCart(distributorSlug, accessToken)
      .then(reconcile)
      .catch(() => {})
      .finally(() => setCartLoading(false));
  }, [distributorSlug, user, accessToken, reconcile]);

  const syncItem = useCallback(
    async (productId: string, quantity: number) => {
      if (!accessToken || (relationshipStatus != null && relationshipStatus !== TradeRelationshipStatus.ACTIVE)) return;
      setSavingItems((prev) => new Set([...prev, productId]));

      setInCart((prev) => new Set([...prev, productId]));
      setQuantities((prev) => ({ ...prev, [productId]: quantity }));

      try {
        const cart = await cartApi.upsertItem({ distributorSlug, productId, quantity }, accessToken);
        reconcile(cart);
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
    [accessToken, relationshipStatus, distributorSlug, reconcile],
  );

  const adjustQty = useCallback((productId: string, delta: number) => {
    const next = Math.max(0, (quantities[productId] ?? 0) + delta);
    syncItem(productId, next);
  }, [quantities, syncItem]);

  const refreshCart = useCallback(async () => {
    if (!accessToken) return;
    const cart = await cartApi.getCart(distributorSlug, accessToken);
    reconcile(cart);
  }, [accessToken, distributorSlug, reconcile]);

  const cartCount = [...inCart].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  // Optimistic — recomputed from local quantities so quantity +/- feels
  // instant. Simple qty x frozen unit price, not tax business logic, so
  // duplicating it here carries none of the "two implementations" risk that
  // taxAmount/total did.
  const subtotal = items.reduce(
    (sum, item) => sum + (quantities[item.productId] ?? item.quantity) * parseFloat(item.unitPrice),
    0,
  );

  const { taxAmount, total, taxLabel } = serverTotals;

  return (
    <CartContext.Provider value={{ cartLoading, cartCount, subtotal, taxAmount, taxLabel, total, items, quantities, inCart, savingItems, adjustQty, syncItem, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function useCartSafe(): CartContextValue | null {
  return useContext(CartContext);
}
