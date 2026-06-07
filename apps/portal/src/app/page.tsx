'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, isLoading } = useRequireAuth();
  const { logout } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-muted">{user.organisationName}</span>
        <button
          onClick={logout}
          className="text-sm text-muted hover:text-[#1A1A1A]"
        >
          Log out
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-xl font-medium">Welcome back, {user.firstName}!</p>
        <div className="mt-1 h-0.5 w-10 bg-accent" />
        <p className="mt-6 text-sm text-muted">More features coming soon.</p>
      </main>
    </div>
  );
}
