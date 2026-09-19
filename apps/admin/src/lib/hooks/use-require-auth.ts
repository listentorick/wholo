'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../auth-context';
import { getPendingInviteToken } from '../pending-invite';

export function useRequireAuth() {
  const { user, isLoading, onboardingRequired, accessDenied, login } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    // A Keycloak-authenticated visitor with no Wholo user belongs in the
    // onboarding wizard, not the login bounce (which would loop via SSO).
    // One with a Wholo user that isn't a distributor belongs on the
    // access-denied explainer, never in the dashboard shell.
    if (accessDenied) {
      router.replace('/access-denied');
    } else if (onboardingRequired) {
      // Someone mid-way through accepting a team invitation (e.g. back from
      // Keycloak's verify-email link, on the app root) must finish that, not be
      // offered the wizard that creates their own distributor.
      router.replace(getPendingInviteToken() ? '/accept-invite' : '/onboarding');
    } else if (!user) {
      // Send the current path straight through as Keycloak's redirectUri so
      // the browser lands back on the deep link after auth, not on '/'.
      login(pathname);
    }
  }, [user, isLoading, onboardingRequired, accessDenied, login, pathname, router]);

  return { user, isLoading };
}
