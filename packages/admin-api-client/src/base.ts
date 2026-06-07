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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as any).process?.env as Record<string, string | undefined> | undefined;
  return env?.['NEXT_PUBLIC_ADMIN_API_URL'] ?? 'http://localhost:3002';
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
