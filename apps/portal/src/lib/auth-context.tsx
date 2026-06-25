'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi, ApiError } from '@wholo/api-client';
import type { AuthUser } from '@wholo/types';

const ORDER_AS_STORAGE_KEY = 'orderAs_session';

interface OrderAsState {
  sessionToken: string;
  customerName: string;
  returnUrl: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  orderAsMode: boolean;
  orderAsCustomerName: string | null;
  login: (returnUrl?: string) => void;
  loginWithRedirect: (redirectUri: string) => void;
  registerWithRedirect: (redirectUri: string) => void;
  logout: () => void;
  setOrderAsSession: (data: OrderAsState) => void;
  clearOrderAsSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let initPromise: Promise<boolean> | null = null;

async function getKeycloakAuth(): Promise<boolean> {
  if (initPromise) return initPromise;

  const { default: Keycloak } = await import('keycloak-js');
  const kc = new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'wholo',
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'wholo-portal',
  });

  initPromise = kc.init({ checkLoginIframe: false }).then((authenticated) => {
    (window as any).__kc = kc;
    return authenticated;
  });

  return initPromise;
}

// Synchronously determine auth state before first render.
// window.__kc exists → same React session, already authenticated (client-side nav).
// No __kc + ?code= in URL → Keycloak callback, need to process code.
// No __kc + no ?code= → fresh page load, will always need a Keycloak redirect.
function getInitialAuthCase(): 'ready' | 'callback' | 'redirect' {
  if (typeof window === 'undefined') return 'callback'; // SSR: treat as callback (safe default)
  if ((window as any).__kc) return 'ready';
  const search = window.location.search;
  if (search.includes('code=') && search.includes('session_state=')) return 'callback';
  return 'redirect';
}

function FullPageSpinner() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <div style={{ width: '24px', height: '24px', border: '2px solid #e5e7eb', borderTopColor: '#D97036', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const authCase = useRef(getInitialAuthCase());
  // 'ready' → isLoading starts false (already authenticated, client-side nav)
  // 'callback' or 'redirect' → isLoading starts true
  const [isLoading, setIsLoading] = useState(authCase.current !== 'ready');
  const [orderAsState, setOrderAsStateInternal] = useState<OrderAsState | null>(null);

  useEffect(() => {
    if (authCase.current === 'ready') {
      // Already have a kc instance from this React session — just sync user state.
      const kc = (window as any).__kc;
      if (kc?.token) {
        setAccessToken(kc.token);
        authApi.me(kc.token)
          .then((profile) => setUser(profile as AuthUser))
          .catch(() => {});
      }
      return;
    }

    if (authCase.current === 'redirect') {
      // Fresh page load with no code — skip kc.init(), go straight to Keycloak.
      const returnUrl = window.location.pathname + window.location.search;
      const redirectUri = window.location.origin + returnUrl;
      getKeycloakAuth().then(() => {
        (window as any).__kc?.login({ redirectUri });
      });
      // isLoading stays true; we're leaving the page.
      return;
    }

    // 'callback' — Keycloak returned with ?code=. Run full init to process it.
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

        try {
          const profile = await authApi.me(token);
          setUser(profile as AuthUser);
        } catch {
          // Token valid but Wholo profile unavailable
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((returnUrlOverride?: string) => {
    const kc = (window as any).__kc;
    const params = new URLSearchParams(window.location.search);
    const returnUrl = returnUrlOverride ?? params.get('returnUrl') ?? '/';
    const redirectUri = window.location.origin + returnUrl;
    if (kc) {
      kc.login({ redirectUri });
    } else {
      getKeycloakAuth().then(() => {
        (window as any).__kc?.login({ redirectUri });
      });
    }
  }, []);

  const loginWithRedirect = useCallback((redirectUri: string) => {
    const kc = (window as any).__kc;
    if (kc) {
      kc.login({ redirectUri });
    } else {
      getKeycloakAuth().then(() => {
        (window as any).__kc?.login({ redirectUri });
      });
    }
  }, []);

  const registerWithRedirect = useCallback((redirectUri: string) => {
    const kc = (window as any).__kc;
    if (kc) {
      kc.register({ redirectUri });
    } else {
      getKeycloakAuth().then(() => {
        (window as any).__kc?.register({ redirectUri });
      });
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    (window as any).__kc?.logout({ redirectUri: window.location.origin + '/login' });
  }, []);

  const setOrderAsSession = useCallback((data: OrderAsState) => {
    // Store session token in sessionStorage (per-tab, survives refresh, not shared across tabs)
    sessionStorage.setItem(ORDER_AS_STORAGE_KEY, data.sessionToken);
    setOrderAsStateInternal(data);
  }, []);

  const clearOrderAsSession = useCallback(() => {
    const returnUrl = orderAsState?.returnUrl ?? '/';
    sessionStorage.removeItem(ORDER_AS_STORAGE_KEY);
    setOrderAsStateInternal(null);
    window.location.href = returnUrl;
  }, [orderAsState]);

  return (
    <AuthContext.Provider value={{
      user,
      accessToken,
      isLoading,
      orderAsMode: orderAsState !== null,
      orderAsCustomerName: orderAsState?.customerName ?? null,
      login,
      loginWithRedirect,
      registerWithRedirect,
      logout,
      setOrderAsSession,
      clearOrderAsSession,
    }}>
      {isLoading ? <FullPageSpinner /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
