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

function getBaseUrl(): string {
  // Same-origin relative URL — works in both browser and Next.js custom server context.
  // In local dev with portal running standalone (port 3000), set NEXT_PUBLIC_API_URL to
  // override (e.g. http://localhost:3003) so calls reach the portal-api.
  return process.env['NEXT_PUBLIC_API_URL'] ?? '';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> ?? {}),
  };
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

  return res.json() as Promise<T>;
}
