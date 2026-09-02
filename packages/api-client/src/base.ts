import type { ProblemDetail } from '@wholo/types';

export class ApiError extends Error {
  constructor(
    public readonly problem: ProblemDetail,
    public readonly status: number,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

type TokenProvider = () => Promise<string>;

let tokenProvider: TokenProvider | null = null;

/**
 * Register the single source of bearer tokens for authenticated requests.
 * `apps/portal` installs its centralised `getAuthToken()` here, so every request
 * that doesn't pass an explicit `token` refreshes the Keycloak access token
 * (via `keycloak.updateToken`) before it is attached. Pass `null` to clear.
 */
export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

function getBaseUrl(): string {
  // Same-origin relative URL — works in both browser and Next.js custom server context.
  // In local dev with portal running standalone (port 3000), set NEXT_PUBLIC_API_URL to
  // override (e.g. http://localhost:3003) so calls reach the portal-api.
  return process.env['NEXT_PUBLIC_API_URL'] ?? '';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string; anonymous?: boolean } = {},
): Promise<T> {
  const { token: explicitToken, anonymous, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> ?? {}),
  };
  // An explicit `token` wins (kept for tests / non-portal callers); otherwise
  // pull a freshly-refreshed token from the registered provider. This is the one
  // place a bearer is obtained for portal requests. `anonymous: true` opts a
  // genuinely public endpoint out of the provider entirely.
  const token = anonymous
    ? undefined
    : explicitToken ?? (tokenProvider ? await tokenProvider() : undefined);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Automatically attach the order-as session token when present (per-tab via sessionStorage)
  if (typeof sessionStorage !== 'undefined') {
    const orderAsSession = sessionStorage.getItem('orderAs_session');
    if (orderAsSession) headers['X-Order-As-Session'] = orderAsSession;
  }

  const res = await fetch(`${getBaseUrl()}${path}`, { ...rest, headers });

  if (!res.ok) {
    let problem: ProblemDetail;
    try {
      problem = await res.json();
    } catch {
      problem = { type: 'about:blank', title: res.statusText, status: res.status, detail: res.statusText };
    }
    throw new ApiError(problem, res.status);
  }

  // Text-then-parse rather than res.json(): void actions legitimately
  // respond 2xx with an empty body, and res.json() on an empty body throws —
  // surfacing a success as a failure.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
