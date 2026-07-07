'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Lock, LogOut, Store, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function UserMenuButton() {
  const { user, logout, changePassword } = useAuth();
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
        <Store className="h-5 w-5" strokeWidth={1.5} />
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
            <User className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
            User Settings
          </Link>
          <button
            onClick={() => { setIsOpen(false); changePassword(); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground-secondary transition-colors duration-100 hover:bg-surface-hover hover:text-foreground"
          >
            <Lock className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
            Change Password
          </button>

          <div className="h-px bg-border" />

          {/* Sign out */}
          <button
            onClick={() => { setIsOpen(false); logout(); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground-secondary transition-colors duration-100 hover:bg-error/5 hover:text-error"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
