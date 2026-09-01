'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogOut, Menu, Settings, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDistributor } from '@/lib/distributor-context';
import { UserMenuButton } from './UserMenuButton';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export function NavigationSidebar({ distributorSlug, contextName }: { distributorSlug?: string; contextName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('nav-collapsed') === 'true';
  });

  const pathname = usePathname();
  const { distributor } = useDistributor();
  const { logout } = useAuth();

  const distributorName = distributor?.name ?? distributorSlug ?? contextName ?? 'Stocdup';

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('nav-collapsed', String(next));
  }

  // Close mobile sidebar when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const mainNavItems: NavItem[] = [
    { href: '/', label: 'Our Suppliers', icon: <Home className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />, exact: true },
  ];

  const accountNavItems: NavItem[] = [
    { href: '/settings', label: 'Settings', icon: <Settings className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} /> },
  ];

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  function navItemClass(active: boolean) {
    return [
      'group flex items-center py-2.5 border-l-2 transition-colors duration-150',
      isCollapsed ? 'md:justify-center md:px-0 gap-3 px-4' : 'gap-3 px-4',
      active
        ? 'bg-sidebar-accent/20 border-sidebar-accent text-sidebar-accent font-medium'
        : 'border-transparent text-sidebar-fg/70 hover:bg-sidebar-hover hover:text-sidebar-fg',
    ].join(' ');
  }

  const sidebarPanel = (
    <aside className="flex h-full w-full flex-col bg-sidebar-bg overflow-y-auto">
      {/* Mobile header — always full, isCollapsed is a desktop-only concept */}
      <div className="md:hidden flex h-14 items-center gap-2.5 px-5 border-b border-border bg-topbar-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/stocdup-logo-only.png" alt="" className="h-7 w-7 shrink-0" />
        <span className="text-base font-extrabold tracking-[-0.045em] text-text">
          stocd<span className="text-primary">up</span>
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-muted hover:text-text"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Desktop header — respects isCollapsed */}
      <div className={[
        'hidden md:flex h-14 items-center border-b border-border bg-topbar-bg',
        isCollapsed ? 'justify-center px-3' : 'gap-2.5 px-5',
      ].join(' ')}>
        {isCollapsed ? (
          <button
            onClick={toggleCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-canvas"
            aria-label="Expand navigation"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/stocdup-logo-only.png" alt="" className="h-7 w-7 shrink-0" />
          </button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/stocdup-logo-only.png" alt="" className="h-7 w-7 shrink-0" />
            <span className="text-base font-extrabold tracking-[-0.045em] text-text">
              stocd<span className="text-primary">up</span>
            </span>
            <button
              onClick={toggleCollapsed}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-muted hover:text-text"
              aria-label="Collapse navigation"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3">
        <ul>
          {mainNavItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={navItemClass(isActive(item))}>
                <span className={isActive(item) ? 'text-sidebar-accent' : 'text-sidebar-fg/50 group-hover:text-sidebar-fg/80'}>
                  {item.icon}
                </span>
                <span className={`text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mx-4 my-3 h-px bg-sidebar-border" />

        <ul>
          {accountNavItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={navItemClass(isActive(item))}>
                <span className={isActive(item) ? 'text-sidebar-accent' : 'text-sidebar-fg/50 group-hover:text-sidebar-fg/80'}>
                  {item.icon}
                </span>
                <span className={`text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sign out */}
      <div className="border-t border-sidebar-border py-3">
        <button
          onClick={logout}
          className={[
            'group flex w-full items-center border-l-2 border-transparent py-2.5 text-sm text-sidebar-fg/70 transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-fg',
            isCollapsed ? 'md:justify-center md:px-0 gap-3 px-4' : 'gap-3 px-4',
          ].join(' ')}
        >
          <span className="text-sidebar-fg/50 group-hover:text-sidebar-fg/80">
            <LogOut className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />
          </span>
          <span className={isCollapsed ? 'md:hidden' : ''}>Sign out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-surface border-b border-border px-4 h-14 md:hidden">
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-9 w-9 items-center justify-center text-text"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <span className="text-sm font-medium tracking-wide text-text">{distributorName}</span>

        <div className="flex items-center gap-0.5">
          <UserMenuButton />
        </div>
      </header>

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar wrapper — overlay on mobile, static on desktop */}
      <div
        className={[
          'fixed top-0 left-0 z-50 h-full',
          // Mobile: 80% width, slides in/out
          'w-4/5 transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: sticky column, width transitions smoothly, no transform
          'md:sticky md:top-0 md:z-40 md:h-screen md:translate-x-0',
          'md:transition-[width] md:duration-300 md:ease-in-out',
          isCollapsed ? 'md:w-16' : 'md:w-64',
        ].join(' ')}
      >
        {sidebarPanel}
      </div>
    </>
  );
}
