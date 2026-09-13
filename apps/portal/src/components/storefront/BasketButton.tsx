'use client';

import { useParams, useRouter } from 'next/navigation';
import { ShoppingBasket } from 'lucide-react';
import { useCartSafe } from '@/lib/cart-context';

/**
 * Basket button — only meaningful inside a distributor context (one cart per
 * distributor). `useCartSafe()` returns `null` outside a `CartProvider`
 * (e.g. the account area), where the button renders nothing.
 */
export function BasketButton() {
  const cart = useCartSafe();
  const params = useParams();
  const router = useRouter();
  const slug = typeof params?.distributorSlug === 'string' ? params.distributorSlug : null;

  if (!cart || !slug) return null;

  const { cartCount } = cart;

  return (
    <button
      type="button"
      onClick={() => router.push(`/${slug}/checkout`)}
      className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
      aria-label={`Basket, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
    >
      {cartCount > 0 && (
        <span className="absolute -right-1 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white">
          {cartCount}
        </span>
      )}
      <ShoppingBasket className="h-5 w-5" strokeWidth={1.5} />
    </button>
  );
}
