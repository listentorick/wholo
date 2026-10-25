'use client';

import { OpsLayout } from '@/ops/OpsLayout';

// Ops build only: the `.ops.tsx` extension is a route only when next.config
// adds it to pageExtensions (NEXT_PUBLIC_APP_MODE=ops). In the admin build
// these files are not routes and /ops is a 404 (ADR-078).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <OpsLayout>{children}</OpsLayout>;
}
