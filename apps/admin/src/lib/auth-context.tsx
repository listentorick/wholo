'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { adminAuthApi, adminAssetImagesApi, ApiError } from '@wholo/admin-api-client';
import type { AuthUser, SessionIdentity } from '@wholo/types';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  logoUrl: string | null;
  isLoading: boolean;
  /** Authenticated with Keycloak but no Wholo user yet — route to /onboarding. */
  onboardingRequired: boolean;
  /** Token identity claims, for prefilling the onboarding wizard. */
  identity: SessionIdentity | null;
  /** Re-fetch the session (e.g. right after onboarding completes). */
  refreshSession: () => Promise<void>;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

async function getKeycloakAuth(): Promise<boolean> {
  if (initPromise) return initPromise;

  const { default: Keycloak } = await import('keycloak-js');
  const kc = new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'wholo',
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'wholo-admin',
  });

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
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });

  const loadSession = useCallback(async (token: string) => {
    try {
      const session = await adminAuthApi.session(token);
      if (session.status === 'ACTIVE' && session.user) {
        setUser(session.user);
        setOnboardingRequired(false);
        setIdentity(null);
        if (session.user.organisationId) {
          fetchLogoUrl(token, session.user.organisationId, setLogoUrl);
        }
      } else if (session.status === 'ONBOARDING_REQUIRED') {
        setUser(null);
        setOnboardingRequired(true);
        setIdentity(session.identity ?? null);
      }
    } catch {
      // Network / upstream failure: leave user null WITHOUT flagging
      // onboarding — an outage must not shove existing users into the wizard.
    }
  }, []);

  useEffect(() => {
    getKeycloakAuth()
      .then(async (authenticated) => {
        const kc = (window as any).__kc;
        if (!authenticated || !kc?.token) return;

        const token: string = kc.token;
        setAccessToken(token);

        kc.onTokenExpired = () => {
          kc.updateToken(30)
            .then(() => setAccessToken(kc.token ?? null))
            .catch(() => {
              setUser(null);
              setAccessToken(null);
            });
        };

        const postLoginRedirect = sessionStorage.getItem('kc_post_login_redirect');
        if (postLoginRedirect) sessionStorage.removeItem('kc_post_login_redirect');

        await loadSession(token);

        // Client-side navigation so AuthProvider stays mounted and user state persists
        if (postLoginRedirect && postLoginRedirect !== '/') {
          routerRef.current.push(postLoginRedirect);
        }
      })
      .finally(() => setIsLoading(false));
  }, [loadSession]);

  const refreshSession = useCallback(async () => {
    const kc = (window as any).__kc;
    const token: string | undefined = kc?.token;
    if (token) await loadSession(token);
  }, [loadSession]);

  const login = useCallback(() => {
    const kc = (window as any).__kc;
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get('returnUrl') ?? '/';
    sessionStorage.setItem('kc_post_login_redirect', returnUrl);
    const redirectUri = window.location.origin + '/';
    if (kc) {
      kc.login({ redirectUri });
    } else {
      getKeycloakAuth().then(() => {
        (window as any).__kc?.login({ redirectUri });
      });
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setLogoUrl(null);
    setOnboardingRequired(false);
    setIdentity(null);
    (window as any).__kc?.logout({ redirectUri: window.location.origin + '/login' });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, logoUrl, isLoading, onboardingRequired, identity, refreshSession, login, logout }}
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
