'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { adminAuthApi, adminAssetImagesApi, ApiError } from '@wholo/admin-api-client';
import type { AuthUser } from '@wholo/types';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  logoUrl: string | null;
  isLoading: boolean;
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
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });

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

        try {
          const profile = await adminAuthApi.me(token);
          setUser(profile as AuthUser);
          if ((profile as any).organisationId) {
            fetchLogoUrl(token, (profile as any).organisationId, setLogoUrl);
          }
        } catch {
          // Token valid but Wholo profile unavailable
        }

        // Client-side navigation so AuthProvider stays mounted and user state persists
        if (postLoginRedirect && postLoginRedirect !== '/') {
          routerRef.current.push(postLoginRedirect);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

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
    (window as any).__kc?.logout({ redirectUri: window.location.origin + '/login' });
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, logoUrl, isLoading, login, logout }}>
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
