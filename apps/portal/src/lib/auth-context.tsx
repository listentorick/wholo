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
  authError: string | null;
  orderAsMode: boolean;
  orderAsCustomerId: string | null;
  orderAsCustomerName: string | null;
  orderAsDistributorId: string | null;
  login: (returnUrl?: string) => void;
  loginWithRedirect: (redirectUri: string) => void;
  registerWithRedirect: (redirectUri: string) => void;
  changePassword: () => void;
  logout: () => void;
  /** Re-fetch the profile (e.g. right after an action that just created it, like accepting an invite). */
  refreshSession: () => Promise<void>;
  setOrderAsSession: (data: OrderAsState) => void;
  clearOrderAsSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isSafeReturnUrl(url: string): boolean {
  return (
    url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') && !url.includes('@')
  );
}

let initPromise: Promise<boolean> | null = null;

async function getKeycloakAuth(onTokenExpired: () => void): Promise<boolean> {
  if (initPromise) return initPromise;

  const { default: Keycloak } = await import('keycloak-js');
  const kc = new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'wholo',
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'wholo-portal',
  });

  // Must be assigned before init() — keycloak-js only arms its silent-refresh
  // timer if onTokenExpired is already set when init() installs the initial token.
  kc.onTokenExpired = onTokenExpired;

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [orderAsState, setOrderAsStateInternal] = useState<OrderAsState | null>(null);

  const handleTokenExpired = useCallback(() => {
    const kc = (window as any).__kc;
    kc?.updateToken(30)
      .then(() => setAccessToken(kc.token ?? null))
      .catch(() => {
        setUser(null);
        setAccessToken(null);
      });
  }, []);

  const loadProfile = useCallback(async (token: string) => {
    try {
      const profile = await authApi.me(token);
      setUser(profile as AuthUser);
      // Clears a stale error from an earlier failed fetch (see refreshSession) —
      // this is what lets a caller resync state after it fixes the underlying cause.
      setAuthError(null);
    } catch (err) {
      // Keycloak session is valid but Wholo rejected the identity (e.g. no matching
      // Wholo user record) — surface this rather than letting callers treat it as
      // "not logged in" and loop back into Keycloak's still-valid SSO session.
      setAuthError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Unable to verify your account.');
    }
  }, []);

  useEffect(() => {
    getKeycloakAuth(handleTokenExpired)
      .then(async (authenticated) => {
        const kc = (window as any).__kc;
        if (!authenticated || !kc?.token) return;

        const token: string = kc.token;
        setAccessToken(token);
        await loadProfile(token);
      })
      .finally(() => setIsLoading(false));
  }, [handleTokenExpired, loadProfile]);

  // Re-fetch the profile on demand — for a caller that just performed an action
  // (e.g. accepting an invite) which may have created the Wholo user record that
  // the initial mount fetch above raced against and lost. See ADR/invite-accept fix.
  const refreshSession = useCallback(async () => {
    const kc = (window as any).__kc;
    const token: string | undefined = kc?.token;
    if (token) await loadProfile(token);
  }, [loadProfile]);

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

  const loginWithRedirect = useCallback((redirectUri: string) => {
    const kc = (window as any).__kc;
    if (kc) {
      kc.login({ redirectUri });
    } else {
      getKeycloakAuth(handleTokenExpired).then(() => {
        (window as any).__kc?.login({ redirectUri });
      });
    }
  }, [handleTokenExpired]);

  const registerWithRedirect = useCallback((redirectUri: string) => {
    const kc = (window as any).__kc;
    if (kc) {
      kc.register({ redirectUri });
    } else {
      getKeycloakAuth(handleTokenExpired).then(() => {
        (window as any).__kc?.register({ redirectUri });
      });
    }
  }, [handleTokenExpired]);

  const changePassword = useCallback(() => {
    const kc = (window as any).__kc;
    const redirectUri = window.location.href;
    if (kc) {
      kc.login({ action: 'UPDATE_PASSWORD', redirectUri });
    } else {
      getKeycloakAuth(handleTokenExpired).then(() => {
        (window as any).__kc?.login({ action: 'UPDATE_PASSWORD', redirectUri });
      });
    }
  }, [handleTokenExpired]);

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
      authError,
      orderAsMode: orderAsState !== null,
      orderAsCustomerId: orderAsState?.customerId ?? null,
      orderAsCustomerName: orderAsState?.customerName ?? null,
      orderAsDistributorId: orderAsState?.distributorId ?? null,
      login,
      loginWithRedirect,
      registerWithRedirect,
      changePassword,
      logout,
      refreshSession,
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
