'use client';

import dynamic from 'next/dynamic';

/**
 * The form pulls in react-hook-form + zod. It sits near the foot of the page,
 * so we load it client-side after mount to keep the initial bundle lean.
 */
const RegisterForm = dynamic(
  () => import('./RegisterForm').then((m) => m.RegisterForm),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[520px] animate-pulse rounded-lg bg-white/90 p-6 sm:p-8">
        <div className="grid gap-3.5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-3 w-24 rounded bg-border" />
              <div className="h-10 rounded-md bg-canvas" />
            </div>
          ))}
        </div>
        <div className="mt-6 h-11 rounded-md bg-primary/30" />
      </div>
    ),
  },
);

export function RegisterFormLazy({ variant }: { variant?: string }) {
  return <RegisterForm variant={variant} />;
}
