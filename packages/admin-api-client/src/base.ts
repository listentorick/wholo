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
 * `apps/admin` installs its centralised `getAuthToken()` here, so every request
 * that doesn't pass an explicit `token` refreshes the Keycloak access token
 * (via `keycloak.updateToken`) before it is attached. Pass `null` to clear.
 */
export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

/**
 * Resolve the bearer for a request: an explicit token wins (kept for tests /
 * non-admin callers), otherwise pull a freshly-refreshed one from the registered
 * provider. Exported for the two bespoke fetch paths (`apiFetchMultipart`,
 * `downloadManifest`) that can't route through `apiFetch`.
 */
export async function getRequestToken(explicitToken?: string): Promise<string | undefined> {
  if (explicitToken) return explicitToken;
  return tokenProvider ? tokenProvider() : undefined;
}

export function getBaseUrl(): string {
  return '';
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
  // `anonymous: true` opts a genuinely public endpoint out of the provider
  // entirely; otherwise this is the one place a bearer is obtained for admin
  // requests.
  const token = anonymous ? undefined : await getRequestToken(explicitToken);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

  if (res.status === 204) return undefined as T;
  // Text-then-parse rather than res.json(): void actions (e.g. accounting
  // confirm/ignore/unlink) legitimately respond 2xx with an empty body, and
  // res.json() on an empty body throws — surfacing a success as a failure.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
