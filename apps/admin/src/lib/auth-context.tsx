'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { adminAuthApi, adminAssetImagesApi, ApiError } from '@wholo/admin-api-client';
import type { AuthUser, SessionIdentity } from '@wholo/types';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  logoUrl: string | null;
  isLoading: boolean;
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
  token: string,
  organisationId: string,
  setLogoUrl: (url: string | null) => void,
) {
  try {
    const imgs = await adminAssetImagesApi.list(token, 'distributor-logo', organisationId);
    const img = imgs[0];
    setLogoUrl(img?.variants['full'] ?? img?.variants['thumb'] ?? null);
  } catch {
    // non-critical
  }
}

// Module-level state so init only happens once across React Strict Mode double-effects
let initPromise: Promise<boolean> | null = null;

async function getKeycloakAuth(onTokenExpired: () => void): Promise<boolean> {
  if (initPromise) return initPromise;

  const { default: Keycloak } = await import('keycloak-js');
  const kc = new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'wholo',
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'wholo-admin',
  });

  // Must be assigned before init() — keycloak-js only arms its silent-refresh
  // timer if onTokenExpired is already set when init() installs the initial token.
  kc.onTokenExpired = onTokenExpired;

  initPromise = kc.init({ checkLoginIframe: false }).then((authenticated) => {
    // Store instance globally so login/logout can access it
    (window as any).__kc = kc;
    return authenticated;
  });

  return initPromise;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);

  const loadSession = useCallback(async (token: string) => {
    try {
      const session = await adminAuthApi.session(token);
      if (session.status === 'ACTIVE' && session.user) {
        setUser(session.user);
        setOnboardingRequired(false);
        setAccessDenied(false);
        setIdentity(null);
        if (session.user.organisationId) {
          fetchLogoUrl(token, session.user.organisationId, setLogoUrl);
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

  const handleTokenExpired = useCallback(() => {
    const kc = (window as any).__kc;
    kc?.updateToken(30)
      .then(() => setAccessToken(kc.token ?? null))
      .catch(() => {
        setUser(null);
        setAccessToken(null);
      });
  }, []);

  useEffect(() => {
    getKeycloakAuth(handleTokenExpired)
      .then(async (authenticated) => {
        const kc = (window as any).__kc;
        if (!authenticated || !kc?.token) return;

        const token: string = kc.token;
        setAccessToken(token);

        await loadSession(token);
      })
      .finally(() => setIsLoading(false));
  }, [loadSession, handleTokenExpired]);

  const refreshSession = useCallback(async () => {
    const kc = (window as any).__kc;
    const token: string | undefined = kc?.token;
    if (token) await loadSession(token);
  }, [loadSession]);

  const login = useCallback((returnUrlOverride?: string) => {
    const kc = (window as any).__kc;
    const params = new URLSearchParams(window.location.search);
    const requestedReturnUrl = returnUrlOverride ?? params.get('returnUrl') ?? '/';
    // Concatenated directly onto origin below, so a value that isn't a plain
    // same-origin path (e.g. leading "//" or an "@") could re-parse as a
    // redirect to an attacker-controlled host — reject anything but a path.
    const returnUrl = isSafeReturnUrl(requestedReturnUrl) ? requestedReturnUrl : '/';
    const redirectUri = window.location.origin + returnUrl;
    if (kc) {
      kc.login({ redirectUri });
    } else {
      getKeycloakAuth(handleTokenExpired).then(() => {
        (window as any).__kc?.login({ redirectUri });
      });
    }
  }, [handleTokenExpired]);

  const logout = useCallback(() => {
    // Do NOT clear React auth state here first: nulling `user` re-renders the
    // shell, useRequireAuth sees `!user` and fires login() → kc.login(), whose
    // redirect to /authorize supersedes kc.logout()'s redirect to the
    // end-session endpoint — the Keycloak SSO session is never destroyed and the
    // still-valid cookie logs the user straight back in. Let the full-page
    // navigation to Keycloak tear the app down instead. Mirrors apps/portal.
    const kc = (window as any).__kc;
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
        onboardingRequired,
        accessDenied,
        identity,
        refreshSession,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
