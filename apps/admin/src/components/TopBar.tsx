'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/lib/notification-context';

interface TopBarProps {
  onMenuClick: () => void;
}

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];
const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return relativeTimeFormatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return relativeTimeFormatter.format(seconds, 'second');
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logoUrl } = useAuth();
  const { unreadCount, recent, fetchRecent, markRead } = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleToggleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next) fetchRecent();
      return next;
    });
  }

  function handleNotificationClick(id: string, linkPath: string | null) {
    markRead(id);
    setOpen(false);
    if (linkPath) router.push(linkPath);
  }

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
        <div ref={containerRef} className="relative">
          <button
            onClick={handleToggleOpen}
            className="relative flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text"
            aria-label="Notifications"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4.5 w-4.5">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border border-border bg-white shadow-lg">
              {recent.length === 0 ? (
                <p className="p-4 text-sm text-muted">No notifications yet</p>
              ) : (
                <ul className="max-h-96 overflow-y-auto">
                  {recent.map((n) => (
                    <li key={n.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n.id, n.linkPath)}
                        className="block w-full px-4 py-3 text-left hover:bg-surface transition-colors"
                      >
                        <p className={n.readAt ? 'text-sm text-muted' : 'text-sm font-medium text-text'}>{n.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                        <p className="mt-1 text-[11px] text-muted">{relativeTime(n.createdAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

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
