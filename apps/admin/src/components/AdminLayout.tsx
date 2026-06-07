'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-surface">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — static on lg+, slide-over drawer on smaller screens */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 flex flex-col bg-sidebar-bg transition-transform duration-200 ease-in-out',
          'lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{ width: 'var(--sidebar-width)' }}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} onLogout={logout} />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
