'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth-context';

export function useRequireAuth(returnUrl?: string) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      const path = returnUrl
        ? `/login?returnUrl=${encodeURIComponent(returnUrl)}`
        : '/login';
      router.replace(path);
    }
  }, [user, isLoading, router, returnUrl]);

  return { user, isLoading };
}
