'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, ApiError } from '@wholo/api-client';
import type { AuthUser } from '@wholo/types';
import { ensureKeycloak, getKeycloak } from './keycloak';
import {
  installAuthToken,
  isSessionExpired,
  onSessionExpired,
  resetAuthTokenState,
} from './auth-token';

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
  /** Refresh has failed — authenticated requests are blocked until the user signs in again. */
  sessionExpired: boolean;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [orderAsState, setOrderAsStateInternal] = useState<OrderAsState | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      // Token comes from the centralised provider (installAuthToken) — no snapshot here.
      const profile = await authApi.me();
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
    // Wire getAuthToken into the api-client and the keycloak-js refresh timer.
    installAuthToken();
    if (isSessionExpired()) setSessionExpired(true);
    const unsubscribe = onSessionExpired(() => setSessionExpired(true));

    ensureKeycloak()
      .then(async (kc) => {
        if (!kc?.authenticated || !kc.token) return;
        setAccessToken(kc.token);
        await loadProfile();
      })
      .finally(() => setIsLoading(false));

    return unsubscribe;
  }, [loadProfile]);

  // Re-fetch the profile on demand — for a caller that just performed an action
  // (e.g. accepting an invite) which may have created the Wholo user record that
  // the initial mount fetch above raced against and lost. See ADR/invite-accept fix.
  const refreshSession = useCallback(async () => {
    if (getKeycloak()?.token) await loadProfile();
  }, [loadProfile]);

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

  const loginWithRedirect = useCallback((redirectUri: string) => {
    resetAuthTokenState();
    ensureKeycloak().then((kc) => kc?.login({ redirectUri }));
  }, []);

  const registerWithRedirect = useCallback((redirectUri: string) => {
    resetAuthTokenState();
    ensureKeycloak().then((kc) => kc?.register({ redirectUri }));
  }, []);

  const changePassword = useCallback(() => {
    const redirectUri = window.location.href;
    ensureKeycloak().then((kc) => kc?.login({ action: 'UPDATE_PASSWORD', redirectUri }));
  }, []);

  const logout = useCallback(() => {
    resetAuthTokenState();
    sessionStorage.removeItem(ORDER_AS_STORAGE_KEY);
    const kc = getKeycloak();
    try {
      kc!.logout({ redirectUri: window.location.origin + '/login' });
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
      sessionExpired,
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center"
    >
      <p id="session-expired-heading" className="max-w-sm text-sm font-medium text-foreground">
        Your session has expired. Sign in again to continue.
      </p>
      <button
        onClick={onSignIn}
        className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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
