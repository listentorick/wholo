'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { UserMenuButton } from '@/components/UserMenuButton';
import { BasketButton } from '@/components/storefront/BasketButton';
import { Wordmark } from './Wordmark';
import { PlatformSearchPlaceholder } from './PlatformSearchPlaceholder';

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
