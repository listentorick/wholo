'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { OpsLogoTag } from './SidebarParts';
import { getSelection } from './selection';
import { OPS_BUILD_MARKER } from './marker';
import { opsTitle } from './title';

const NAV = [
  { href: '/ops', label: 'Dashboard', title: undefined },
  { href: '/ops/wholesalers', label: 'Wholesalers', title: 'Wholesalers' },
  { href: '/ops/grants', label: 'My access', title: 'My access' },
];

/** The Ops pages' own shell: platform nav instead of a wholesaler's. */
export function OpsLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  const { logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selection] = useState(() => (typeof window === 'undefined' ? null : getSelection()));

  const current = NAV.find((n) => n.href === pathname);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const nav = (
    <div className="flex h-full flex-col text-sidebar-fg">
      <div className="flex h-topbar shrink-0 items-center gap-2.5 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/stocdup-logo-only.png" alt="" className="h-8 w-8 shrink-0" />
        <span className="text-[18px] font-extrabold tracking-[-0.045em]">stocdup</span>
        <OpsLogoTag />
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map((item) => {
          const active = item.href === pathname;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center rounded px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-sidebar-hover text-sidebar-fg' : 'text-sidebar-fg/70 hover:bg-sidebar-hover hover:text-sidebar-fg',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 space-y-0.5 border-t border-sidebar-border px-3 py-3">
        {selection && (
          <Link href="/" className="block rounded px-3 py-2 text-sm font-medium text-support transition-colors hover:bg-sidebar-hover">
            Return to {selection.name}
          </Link>
        )}
        <button
          type="button"
          onClick={logout}
          className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-sidebar-fg/70 transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg"
        >
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas" data-build={OPS_BUILD_MARKER}>
      <title>{opsTitle(null, current?.title)}</title>
      {menuOpen && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 w-sidebar bg-sidebar-bg transition-transform duration-200 lg:static lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {nav}
      </aside>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-topbar-bg px-4">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <p className="ml-auto truncate text-sm font-medium text-text">
            {user.firstName} {user.lastName}
            <span className="ml-2 text-xs font-normal text-muted">Stocdup operator</span>
          </p>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
