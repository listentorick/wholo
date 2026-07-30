'use client';

import { NavigationSidebar } from '@/components/NavigationSidebar';
import { UserMenuButton } from '@/components/UserMenuButton';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { useAuth } from '@/lib/auth-context';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, authError, logout } = useAuth();

  if (authError) {
    return (
      <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-foreground">We couldn&apos;t sign you in</p>
        <p className="max-w-sm text-sm text-foreground-secondary">{authError}</p>
        <button
          onClick={logout}
          className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex">
      <NavigationSidebar contextName={user?.organisationName} />
      <main className="flex flex-1 flex-col min-h-screen min-w-0 bg-white pt-14 md:pt-0">
        <header className="hidden md:flex sticky top-0 z-20 items-center justify-between bg-white border-b border-border h-14 px-6">
          <span className="text-sm font-medium text-foreground">{user?.organisationName}</span>
          <UserMenuButton />
        </header>
        <OrderAsBanner />
        {children}
      </main>
    </div>
  );
}
