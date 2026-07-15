'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth-context';

export function useRequireAuth() {
  const { user, isLoading, onboardingRequired } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      // A Keycloak-authenticated visitor with no Wholo user belongs in the
      // onboarding wizard, not the login bounce (which would loop via SSO).
      router.replace(onboardingRequired ? '/onboarding' : '/login');
    }
  }, [user, isLoading, onboardingRequired, router]);

  return { user, isLoading };
}
