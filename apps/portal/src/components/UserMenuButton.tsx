'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

function VenueIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M3 10l9-7 9 7" />
      <path d="M3 10v11h18V10" />
      <rect x="9" y="14" width="6" height="7" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function UserMenuButton() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => user && setIsOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded text-[#4B5563] transition-colors hover:bg-[#F3F4F6] hover:text-[#1A1A1A]"
        aria-label="Open user menu"
        aria-expanded={isOpen}
      >
        <VenueIcon />
      </button>

      {isOpen && user && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[80vw] overflow-hidden bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05] md:w-64">

          {/* Identity — warm grey header */}
          <div className="flex items-center gap-3 bg-surface-sidebar px-4 py-4">
            <div className="flex h-9 w-9 flex-shrink-0 select-none items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
              {(user.firstName?.[0] ?? '').toUpperCase()}{(user.lastName?.[0] ?? '').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-muted">Signed in as</p>
              <p className="truncate text-sm font-semibold text-foreground">{`${user.firstName} ${user.lastName}`.trim()}</p>
              <p className="truncate text-xs text-foreground-tertiary">{user.email}</p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Settings links */}
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground-secondary transition-colors duration-100 hover:bg-surface-hover hover:text-foreground"
          >
            <UserIcon />
            User Settings
          </Link>
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground-secondary transition-colors duration-100 hover:bg-surface-hover hover:text-foreground"
          >
            <VenueIcon className="h-4 w-4 flex-shrink-0" />
            Business Settings
          </Link>

          <div className="h-px bg-border" />

          {/* Sign out */}
          <button
            onClick={() => { setIsOpen(false); logout(); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground-secondary transition-colors duration-100 hover:bg-error/5 hover:text-error"
          >
            <SignOutIcon />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
