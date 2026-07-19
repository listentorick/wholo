'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { AdminLayout } from '@/components/AdminLayout';

export default function DashboardPage() {
  const { user, isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'hsl(var(--color-primary))' }}
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-text">
            Welcome back, {user.firstName}
          </h1>
          <p className="mt-1 text-sm text-muted">{user.organisationName}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Open Orders', value: '—' },
            { label: 'Pending Deliveries', value: '—' },
            { label: 'Low Stock Items', value: '—' },
            { label: 'Active Customers', value: '—' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded border border-border bg-surface p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-text">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Placeholder content */}
        <div className="rounded border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Dashboard widgets coming soon. Use the sidebar to navigate.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
