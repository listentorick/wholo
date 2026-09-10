'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ShoppingBasket } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { useCartSafe } from '@/lib/cart-context';
import { UserMenuButton } from '@/components/UserMenuButton';
import { Wordmark } from './Wordmark';
import { PlatformSearchPlaceholder } from './PlatformSearchPlaceholder';

/**
 * Basket button — only meaningful inside a distributor context (one cart per
 * distributor). `useCartSafe()` returns `null` in the account area, where the
 * button renders nothing.
 */
function BasketButton() {
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

/**
 * Global top bar — replaces the dark `NavigationSidebar`. Wordmark (→ home),
 * an inert platform-search field, the acting organisation chip, the basket, and
 * the user menu (which now carries the Settings / Change password / Sign out
 * links the sidebar used to own).
 *
 * `account` variant is `sticky top-0`; `distributor` variant is static and
 * scrolls away (the storefront's own sticky shop block takes over — see
 * `StickyShopBlock`).
 */
export function PortalTopBar({ variant }: { variant: 'account' | 'distributor' }) {
  const { user } = useAuth();

  return (
    <header
      className={clsx(
        'z-30 flex h-14 items-center gap-3 border-b border-border bg-topbar-bg px-4 md:gap-5 md:px-6',
        variant === 'account' && 'sticky top-0',
      )}
    >
      <Link href="/" className="flex-shrink-0" aria-label="Stocdup home">
        <Wordmark textClassName="text-base md:text-lg" />
      </Link>

      <PlatformSearchPlaceholder className="mx-auto hidden max-w-xl flex-1 md:flex" />

      <div className="ml-auto flex flex-shrink-0 items-center gap-2 md:ml-0">
        <BasketButton />
        {user?.organisationName && (
          <span className="hidden max-w-[12rem] truncate text-sm text-muted sm:inline">
            {user.organisationName}
          </span>
        )}
        <UserMenuButton />
      </div>
    </header>
  );
}
