'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCartSafe } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 flex-shrink-0">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function DeliveryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 flex-shrink-0">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 5v3h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 flex-shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function PasswordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 flex-shrink-0">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 flex-shrink-0">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 mt-0.5">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

function BurgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
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
    { href: '/', label: 'Our Suppliers', icon: <StoreIcon />, exact: true },
    ...(distributorSlug ? [
      { href: `/${distributorSlug}/delivery-settings`, label: 'Delivery Settings', icon: <DeliveryIcon /> },
    ] : []),
  ];

  const accountNavItems: NavItem[] = [
    { href: '/settings', label: 'Settings', icon: <SettingsIcon /> },
    { href: '/change-password', label: 'Change Password', icon: <PasswordIcon /> },
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
          <CloseIcon />
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
              <CloseIcon />
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
            <SignOutIcon />
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
          <BurgerIcon />
        </button>

        <span className="text-sm font-medium tracking-wide text-[#1A1A1A]">{distributorName}</span>

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
            <CartIcon />
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
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
          'md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0',
          'md:transition-[width] md:duration-300 md:ease-in-out',
          isCollapsed ? 'md:w-16' : 'md:w-64',
        ].join(' ')}
      >
        {sidebarPanel}
      </div>
    </>
  );
}
