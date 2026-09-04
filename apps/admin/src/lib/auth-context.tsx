'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { adminAuthApi, adminAssetImagesApi, ApiError } from '@wholo/admin-api-client';
import type { AuthUser, SessionIdentity } from '@wholo/types';
import { ensureKeycloak, getKeycloak } from './keycloak';
import {
  installAuthToken,
  isSessionExpired,
  onSessionExpired,
  resetAuthTokenState,
} from './auth-token';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  logoUrl: string | null;
  isLoading: boolean;
  /** Refresh has failed — authenticated requests are blocked until the user signs in again. */
  sessionExpired: boolean;
  /** Authenticated with Keycloak but no Wholo user yet — route to /onboarding. */
  onboardingRequired: boolean;
  /** Has a Wholo user, but not on a distributor org — route to /access-denied. */
  accessDenied: boolean;
  /** Identity claims for prefilling the onboarding wizard, or for display on /access-denied. */
  identity: SessionIdentity | null;
  /** Re-fetch the session (e.g. right after onboarding completes). */
  refreshSession: () => Promise<void>;
  login: (returnUrl?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isSafeReturnUrl(url: string): boolean {
  return (
    url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') && !url.includes('@')
  );
}

async function fetchLogoUrl(
  organisationId: string,
  setLogoUrl: (url: string | null) => void,
) {
  try {
    const imgs = await adminAssetImagesApi.list('distributor-logo', organisationId);
    const img = imgs[0];
    setLogoUrl(img?.variants['full'] ?? img?.variants['thumb'] ?? null);
  } catch {
    // non-critical
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);

  const loadSession = useCallback(async () => {
    try {
      // Token comes from the centralised provider (installAuthToken) — no snapshot here.
      const session = await adminAuthApi.session();
      if (session.status === 'ACTIVE' && session.user) {
        setUser(session.user);
        setOnboardingRequired(false);
        setAccessDenied(false);
        setIdentity(null);
        if (session.user.organisationId) {
          fetchLogoUrl(session.user.organisationId, setLogoUrl);
        }
      } else if (session.status === 'ONBOARDING_REQUIRED') {
        setUser(null);
        setOnboardingRequired(true);
        setAccessDenied(false);
        setIdentity(session.identity ?? null);
      } else if (session.status === 'ACCESS_DENIED') {
        // Deliberately not setUser here: `user` means "may use the admin app,"
        // and everything gated on it (sidebar, guards) must stay locked out.
        // The denied identity is exposed via `identity` instead, purely for
        // display on the /access-denied page.
        setUser(null);
        setOnboardingRequired(false);
        setAccessDenied(true);
        setIdentity(
          session.user
            ? { email: session.user.email, firstName: session.user.firstName, lastName: session.user.lastName }
            : null,
        );
      }
    } catch {
      // Network / upstream failure: leave user null WITHOUT flagging
      // onboarding — an outage must not shove existing users into the wizard.
    }
  }, []);

  useEffect(() => {
    // Wire getAuthToken into the api-client and the keycloak-js refresh timer.
    installAuthToken();
    if (isSessionExpired()) setSessionExpired(true);
    const unsubscribe = onSessionExpired(() => setSessionExpired(true));

    ensureKeycloak()
      .then(async (kc) => {
        if (!kc?.authenticated || !kc.token) return;
        setAccessToken(kc.token);
        await loadSession();
      })
      .finally(() => setIsLoading(false));

    return unsubscribe;
  }, [loadSession]);

  const refreshSession = useCallback(async () => {
    if (getKeycloak()?.token) await loadSession();
  }, [loadSession]);

  const login = useCallback((returnUrlOverride?: string) => {
    resetAuthTokenState();
    const params = new URLSearchParams(window.location.search);
    const requestedReturnUrl = returnUrlOverride ?? params.get('returnUrl') ?? '/';
    // Concatenated directly onto origin below, so a value that isn't a plain
    // same-origin path (e.g. leading "//" or an "@") could re-parse as a
    // redirect to an attacker-controlled host — reject anything but a path.
    const returnUrl = isSafeReturnUrl(requestedReturnUrl) ? requestedReturnUrl : '/';
    const redirectUri = window.location.origin + returnUrl;
    ensureKeycloak().then((kc) => kc?.login({ redirectUri }));
  }, []);

  const logout = useCallback(() => {
    // Do NOT clear React auth state here first: nulling `user` re-renders the
    // shell, useRequireAuth sees `!user` and fires login() → kc.login(), whose
    // redirect to /authorize supersedes kc.logout()'s redirect to the
    // end-session endpoint — the Keycloak SSO session is never destroyed and the
    // still-valid cookie logs the user straight back in. Let the full-page
    // navigation to Keycloak tear the app down instead. Mirrors apps/portal.
    resetAuthTokenState();
    const kc = getKeycloak();
    if (kc) {
      kc.logout({ redirectUri: window.location.origin + '/login' });
      return;
    }
    // No instance to drive the OIDC end-session redirect — fall back to a local
    // clear + hard redirect.
    setUser(null);
    setAccessToken(null);
    setLogoUrl(null);
    setOnboardingRequired(false);
    setAccessDenied(false);
    setIdentity(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        logoUrl,
        isLoading,
        sessionExpired,
        onboardingRequired,
        accessDenied,
        identity,
        refreshSession,
        login,
        logout,
      }}
    >
      {children}
      {sessionExpired && <SessionExpiredOverlay onSignIn={() => login()} />}
    </AuthContext.Provider>
  );
}

function SessionExpiredOverlay({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-heading"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-canvas px-6 text-center"
    >
      <p id="session-expired-heading" className="max-w-sm text-sm font-medium text-text">
        Your session has expired. Sign in again to continue.
      </p>
      <button
        onClick={onSignIn}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Sign in again
      </button>
    </div>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
