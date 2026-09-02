'use client';

/**
 * Single owner of the `keycloak-js` instance for the portal.
 *
 * Extracted from auth-context so that the non-React token layer (`auth-token.ts`)
 * and `AuthProvider` share exactly one instance and one init promise. The instance
 * is also stashed on `window.__kc` — the established handle used across the app.
 */

export interface KeycloakInstance {
  token?: string;
  authenticated?: boolean;
  onTokenExpired?: () => void;
  updateToken(minValidity: number): Promise<boolean>;
  login(options?: Record<string, unknown>): void;
  register(options?: Record<string, unknown>): void;
  logout(options?: Record<string, unknown>): void;
}

let initPromise: Promise<boolean> | null = null;

// Late-bound so `auth-token.ts` can route the keycloak-js silent-refresh timer
// through the same centralised path a request-time refresh uses, without a static
// import cycle (keycloak.ts must not import auth-token.ts).
let tokenExpiredHandler: () => void = () => {};

export function setTokenExpiredHandler(handler: () => void): void {
  tokenExpiredHandler = handler;
}

/**
 * Initialise keycloak-js on first call, return the shared instance thereafter.
 * Returns the instance whether or not the user is authenticated — callers check
 * `.authenticated` / `.token`.
 */
export async function ensureKeycloak(): Promise<KeycloakInstance | null> {
  if (typeof window === 'undefined') return null;

  // Assigned synchronously on the first call so concurrent callers share the one
  // init — there must only ever be a single keycloak-js instance.
  if (!initPromise) {
    initPromise = (async () => {
      const { default: Keycloak } = await import('keycloak-js');
      const kc = new Keycloak({
        url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
        realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'wholo',
        clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'wholo-portal',
      });

      // Must be assigned before init() — keycloak-js only arms its silent-refresh
      // timer if onTokenExpired is already set when init() installs the initial token.
      kc.onTokenExpired = () => tokenExpiredHandler();

      const authenticated = await kc.init({ checkLoginIframe: false });
      (window as unknown as { __kc: KeycloakInstance }).__kc = kc as unknown as KeycloakInstance;
      return authenticated;
    })();
  }

  await initPromise;
  return (window as unknown as { __kc?: KeycloakInstance }).__kc ?? null;
}

/** The already-initialised instance, or null before `ensureKeycloak()` has resolved. */
export function getKeycloak(): KeycloakInstance | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __kc?: KeycloakInstance }).__kc ?? null;
}
