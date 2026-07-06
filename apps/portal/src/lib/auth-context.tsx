'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi, ApiError } from '@wholo/api-client';
import type { AuthUser } from '@wholo/types';

const ORDER_AS_STORAGE_KEY = 'orderAs_session';

interface OrderAsState {
  sessionToken: string;
  customerId: string;
  customerName: string;
  returnUrl: string;
  distributorId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  orderAsMode: boolean;
  orderAsCustomerId: string | null;
  orderAsCustomerName: string | null;
  orderAsDistributorId: string | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orderAsState, setOrderAsStateInternal] = useState<OrderAsState | null>(null);

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
    sessionStorage.removeItem(ORDER_AS_STORAGE_KEY);
    const kc = (window as any).__kc;
    try {
      kc.logout({ redirectUri: window.location.origin + '/login' });
    } catch {
      setUser(null);
      setAccessToken(null);
      window.location.href = '/login';
    }
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
      orderAsCustomerId: orderAsState?.customerId ?? null,
      orderAsCustomerName: orderAsState?.customerName ?? null,
      orderAsDistributorId: orderAsState?.distributorId ?? null,
      login,
      loginWithRedirect,
      registerWithRedirect,
      logout,
      setOrderAsSession,
      clearOrderAsSession,
    }}>
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
