'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Lock, LogOut, Menu, Settings, ShoppingBasket, Truck, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCartSafe } from '@/lib/cart-context';
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
  const router = useRouter();
  const { distributor } = useDistributor();
  const cartCtx = useCartSafe();
  const cartCount = cartCtx?.cartCount ?? 0;
  const { logout } = useAuth();

  const distributorName = distributor?.name ?? distributorSlug ?? contextName ?? 'Wholo';

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
    ...(distributorSlug ? [
      { href: `/${distributorSlug}/delivery-settings`, label: 'Delivery Settings', icon: <Truck className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} /> },
    ] : []),
  ];

  const accountNavItems: NavItem[] = [
    { href: '/settings', label: 'Settings', icon: <Settings className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} /> },
    { href: '/change-password', label: 'Change Password', icon: <Lock className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} /> },
  ];

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  function navItemClass(active: boolean) {
    return [
      'group flex items-center py-2.5 border-l-2 transition-colors duration-150',
      isCollapsed ? 'md:justify-center md:px-0 gap-3 px-4' : 'gap-3 px-4',
      active
        ? 'bg-[#FDF0E8] border-[#D97036] text-[#D97036] font-medium'
        : 'border-transparent text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#1A1A1A]',
    ].join(' ');
  }

  const sidebarPanel = (
    <aside className="flex h-full w-full flex-col bg-[#F9F8F6] border-r border-[#E5E7EB] overflow-y-auto">
      {/* Mobile header — always full, isCollapsed is a desktop-only concept */}
      <div className="md:hidden flex items-center gap-2 px-5 py-4 border-b border-[#E5E7EB]">
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#D97036]" />
        <span className="text-base font-semibold tracking-tight text-[#D97036]">Wholo</span>
        <button
          onClick={() => setIsOpen(false)}
          className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-[#9CA3AF] hover:text-[#1A1A1A]"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Desktop header — respects isCollapsed */}
      <div className={[
        'hidden md:flex border-b border-[#E5E7EB]',
        isCollapsed ? 'justify-center px-3 py-4' : 'items-center gap-2 px-5 py-4',
      ].join(' ')}>
        {isCollapsed ? (
          <button
            onClick={toggleCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#F3F4F6]"
            aria-label="Expand navigation"
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#D97036]" />
          </button>
        ) : (
          <>
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#D97036]" />
            <span className="text-base font-semibold tracking-tight text-[#D97036]">Wholo</span>
            <button
              onClick={toggleCollapsed}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-[#9CA3AF] hover:text-[#1A1A1A]"
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
                <span className={isActive(item) ? 'text-[#D97036]' : 'text-[#9CA3AF] group-hover:text-[#4B5563]'}>
                  {item.icon}
                </span>
                <span className={`text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mx-4 my-3 h-px bg-[#E5E7EB]" />

        <ul>
          {accountNavItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={navItemClass(isActive(item))}>
                <span className={isActive(item) ? 'text-[#D97036]' : 'text-[#9CA3AF] group-hover:text-[#4B5563]'}>
                  {item.icon}
                </span>
                <span className={`text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sign out */}
      <div className="border-t border-[#E5E7EB] py-3">
        <button
          onClick={logout}
          className={[
            'group flex w-full items-center border-l-2 border-transparent py-2.5 text-sm text-[#4B5563] transition-colors duration-150 hover:bg-[#F3F4F6] hover:text-[#1A1A1A]',
            isCollapsed ? 'md:justify-center md:px-0 gap-3 px-4' : 'gap-3 px-4',
          ].join(' ')}
        >
          <span className="text-[#9CA3AF] group-hover:text-[#4B5563]">
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
      <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-white border-b border-[#E5E7EB] px-4 h-14 md:hidden">
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-9 w-9 items-center justify-center text-[#1A1A1A]"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <span className="text-sm font-medium tracking-wide text-[#1A1A1A]">{distributorName}</span>

        <div className="flex items-center gap-0.5">
          {distributorSlug ? (
            <button
              onClick={() => router.push(`/${distributorSlug}/checkout`)}
              className="relative flex h-9 w-9 items-center justify-center text-[#1A1A1A]"
              aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
            >
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-1 text-[11px] font-semibold leading-none text-[#1A1A1A]">
                  {cartCount}
                </span>
              )}
              <ShoppingBasket className="h-5 w-5 mt-0.5" strokeWidth={1.5} />
            </button>
          ) : null}
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
