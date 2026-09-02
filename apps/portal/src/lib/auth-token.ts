'use client';

import { setTokenProvider } from '@wholo/api-client';
import { ensureKeycloak, setTokenExpiredHandler } from './keycloak';

/**
 * Centralised portal auth token.
 *
 * Every authenticated portal API request obtains its bearer through `getAuthToken()`
 * (wired into `@wholo/api-client`'s `apiFetch` via `setTokenProvider`). Before
 * returning the token it calls `keycloak.updateToken(30)`, which checks the token
 * locally and only contacts Keycloak when a refresh is actually needed — this is
 * what lets the PWA recover after being suspended past the 15-minute access-token
 * lifetime.
 *
 * Components and individual API methods must NOT implement their own refresh logic
 * or hold token snapshots; they call the API client, which calls this.
 */

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired.');
    this.name = 'SessionExpiredError';
  }
}

// Once a refresh has genuinely failed, every subsequent getAuthToken() rejects
// immediately — no keycloak call, no network — so a failure can't turn into a
// storm of retried API requests. Cleared only by a fresh sign-in.
let sessionExpired = false;
let refreshInFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function isSessionExpired(): boolean {
  return sessionExpired;
}

/** Subscribe to the session-expired latch flipping. Returns an unsubscribe fn. */
export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markSessionExpired(): void {
  if (sessionExpired) return;
  sessionExpired = true;
  listeners.forEach((l) => l());
}

/** Clear the latch — called when a fresh Keycloak login flow is started. */
export function resetAuthTokenState(): void {
  sessionExpired = false;
  refreshInFlight = null;
}

/**
 * The single source of bearer tokens for authenticated portal requests.
 * Refreshes the Keycloak token if it is within 30s of expiry, then returns it.
 * Rejects with `SessionExpiredError` when no valid token can be obtained.
 */
export async function getAuthToken(): Promise<string> {
  if (sessionExpired) throw new SessionExpiredError();

  const kc = await ensureKeycloak();
  if (!kc || !kc.authenticated) {
    // No session at all (not a *lapsed* one) — the route guards redirect to
    // Keycloak; surface an error to the caller but don't latch the expired UI.
    throw new SessionExpiredError();
  }

  // Concurrent callers share one refresh operation.
  if (!refreshInFlight) {
    refreshInFlight = kc
      .updateToken(30)
      .then(() => undefined)
      .catch((err: unknown) => {
        markSessionExpired();
        throw err;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  try {
    await refreshInFlight;
  } catch {
    throw new SessionExpiredError();
  }

  if (!kc.token) {
    markSessionExpired();
    throw new SessionExpiredError();
  }
  return kc.token;
}

let installed = false;

/**
 * Install `getAuthToken` as the api-client token provider and route the
 * keycloak-js silent-refresh timer through the same path. Idempotent; called
 * once from `AuthProvider`.
 */
export function installAuthToken(): void {
  if (installed) return;
  installed = true;
  setTokenProvider(getAuthToken);
  setTokenExpiredHandler(() => {
    // Fire-and-forget: on failure the latch is set and the UI reacts; the next
    // request would surface it anyway.
    void getAuthToken().catch(() => {});
  });
}
