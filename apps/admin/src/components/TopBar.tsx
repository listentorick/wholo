'use client';

import { useAuth } from '@/lib/auth-context';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logoUrl } = useAuth();

  return (
    <header
      className="flex shrink-0 items-center gap-4 border-b border-border bg-topbar-bg px-4"
      style={{ height: 'var(--topbar-height)' }}
    >
      {/* Hamburger — visible on mobile only */}
      <button
        onClick={onMenuClick}
        className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text lg:hidden"
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="ml-auto flex items-center gap-3">
        {/* Notification bell */}
        <button className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4.5 w-4.5">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </button>

        {/* User identity */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={user.organisationName} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-primary-fg">
                  {user.firstName[0]}{user.lastName[0]}
                </span>
              )}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-text leading-tight">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-muted leading-tight">{user.organisationName}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
