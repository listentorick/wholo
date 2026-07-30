'use client';

import { useEffect } from 'react';
import { useAuth } from '../auth-context';

export function useRequireAuth(returnUrl?: string) {
  const { user, accessToken, isLoading, authError, orderAsMode, orderAsDistributorId, login } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    // A Keycloak session can be valid while Wholo rejects the identity (e.g. no matching
    // user record) — redirecting back to Keycloak in that case just loops forever, since
    // Keycloak silently re-authenticates an already-valid session. Only redirect when we
    // genuinely have no session to work with.
    if (!user && !authError) {
      login(returnUrl);
    }
  }, [user, authError, isLoading, login, returnUrl]);

  return { user, accessToken, isLoading, authError, orderAsMode, orderAsDistributorId };
}
