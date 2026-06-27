'use client';

import { useEffect } from 'react';
import { useAuth } from '../auth-context';

export function useRequireAuth(returnUrl?: string) {
  const { user, accessToken, isLoading, orderAsMode, orderAsDistributorId, login } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      login(returnUrl);
    }
  }, [user, isLoading, login, returnUrl]);

  return { user, accessToken, isLoading, orderAsMode, orderAsDistributorId };
}
