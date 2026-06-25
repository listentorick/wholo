'use client';

import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useAuth } from '@/lib/auth-context';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen">
      <NavigationSidebar contextName={user?.organisationName} />
      <main className="flex flex-1 flex-col min-w-0 bg-white pt-14 md:pt-0">
        <header className="hidden md:flex sticky top-0 z-20 items-center bg-white border-b border-border h-14 px-6">
          <span className="text-sm font-medium text-foreground">{user?.organisationName}</span>
        </header>
        {children}
      </main>
    </div>
  );
}
