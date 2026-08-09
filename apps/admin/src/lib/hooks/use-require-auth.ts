'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth-context';

export function useRequireAuth() {
  const { user, isLoading, onboardingRequired, accessDenied } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || accessDenied)) {
      // A Keycloak-authenticated visitor with no Wholo user belongs in the
      // onboarding wizard, not the login bounce (which would loop via SSO).
      // One with a Wholo user that isn't a distributor belongs on the
      // access-denied explainer, never in the dashboard shell.
      router.replace(accessDenied ? '/access-denied' : onboardingRequired ? '/onboarding' : '/login');
    }
  }, [user, isLoading, onboardingRequired, accessDenied, router]);

  return { user, isLoading };
}
