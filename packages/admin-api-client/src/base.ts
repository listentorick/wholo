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
  return '';
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

  if (res.status === 204) return undefined as T;
  // Text-then-parse rather than res.json(): void actions (e.g. accounting
  // confirm/ignore/unlink) legitimately respond 2xx with an empty body, and
  // res.json() on an empty body throws — surfacing a success as a failure.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
