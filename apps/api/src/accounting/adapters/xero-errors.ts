// Parsing of xero-node failures into plain, safe facts. Xero-specific by
// design — nothing here leaves the adapter; callers only ever see the
// AccountingProviderError the adapter builds from it.
//
// xero-node (18.1.0) rejects every failed Accounting API call with a JSON
// *string*: `{ response: { statusCode, body, headers, request }, body }`.
// statusCode is 0 for a transport failure (no HTTP response), with the
// transport error message as body. Verified empirically against the SDK —
// see the adapter spec. Older/other shapes (a rejected object, a thrown
// Error) are handled too so a future SDK change degrades gracefully.

const MAX_DETAIL_CHARS = 500;

export interface ParsedXeroError {
  // Undefined for a transport failure (no HTTP response).
  statusCode?: number;
  validationMessages: string[];
  // Xero's top-level message/title/detail, when present.
  xeroMessage?: string;
  retryAfterMs?: number;
  correlationId?: string;
  // Transport failure detail (e.g. "connect ECONNREFUSED ..."); never a body.
  transportMessage?: string;
}

interface RawXeroErrorShape {
  response?: {
    statusCode?: number;
    status?: number;
    body?: unknown;
    data?: unknown;
    headers?: Record<string, unknown>;
  };
  body?: unknown;
  message?: string;
}

function toShape(err: unknown): RawXeroErrorShape | undefined {
  if (typeof err === 'string') {
    try {
      const parsed = JSON.parse(err);
      return parsed && typeof parsed === 'object' ? (parsed as RawXeroErrorShape) : undefined;
    } catch {
      return undefined;
    }
  }
  if (err && typeof err === 'object') return err as RawXeroErrorShape;
  return undefined;
}

function header(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  const value = key ? headers[key] : undefined;
  if (Array.isArray(value)) return value[0] != null ? String(value[0]) : undefined;
  return value != null ? String(value) : undefined;
}

// Retry-After is seconds (Xero) or, per RFC 9110, an HTTP date.
export function parseRetryAfterMs(value: string | undefined, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

function truncate(s: string): string {
  return s.length > MAX_DETAIL_CHARS ? `${s.slice(0, MAX_DETAIL_CHARS)}…` : s;
}

function extractBodyDetail(body: unknown): { validationMessages: string[]; xeroMessage?: string } {
  if (!body || typeof body !== 'object') return { validationMessages: [] };
  const b = body as {
    Message?: unknown;
    Title?: unknown;
    Detail?: unknown;
    Elements?: Array<{ ValidationErrors?: Array<{ Message?: unknown }> }>;
  };
  const validationMessages = (Array.isArray(b.Elements) ? b.Elements : [])
    .flatMap((el) => (Array.isArray(el?.ValidationErrors) ? el.ValidationErrors : []))
    .map((v) => v?.Message)
    .filter((m): m is string => typeof m === 'string' && m.length > 0)
    .map(truncate);
  const candidate = [b.Detail, b.Message, b.Title].find((m) => typeof m === 'string' && m.length > 0) as
    | string
    | undefined;
  return { validationMessages, xeroMessage: candidate ? truncate(candidate) : undefined };
}

export function parseXeroSdkError(err: unknown): ParsedXeroError {
  if (err instanceof Error && !(err as RawXeroErrorShape).response) {
    // A plain thrown Error (our own timeout, or a pre-request SDK failure).
    return { validationMessages: [], transportMessage: truncate(err.message) };
  }
  const shape = toShape(err);
  const response = shape?.response;
  const rawStatus = response?.statusCode ?? response?.status;
  const statusCode = typeof rawStatus === 'number' && rawStatus > 0 ? rawStatus : undefined;
  const body = response?.body ?? response?.data ?? shape?.body;

  if (statusCode === undefined) {
    const transport = typeof body === 'string' ? body : (shape?.message ?? 'no HTTP response');
    return { validationMessages: [], transportMessage: truncate(transport) };
  }

  const { validationMessages, xeroMessage } = extractBodyDetail(body);
  return {
    statusCode,
    validationMessages,
    xeroMessage,
    retryAfterMs: parseRetryAfterMs(header(response?.headers, 'retry-after')),
    correlationId: header(response?.headers, 'xero-correlation-id'),
  };
}

// Rate-limit headers Xero sends on every Accounting API response.
export interface XeroRateLimitHeaders {
  minRemaining?: number;
  dayRemaining?: number;
  appMinRemaining?: number;
  correlationId?: string;
}

function intHeader(headers: Record<string, unknown> | undefined, name: string): number | undefined {
  const v = header(headers, name);
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function readRateLimitHeaders(headers: Record<string, unknown> | undefined): XeroRateLimitHeaders {
  return {
    minRemaining: intHeader(headers, 'x-minlimit-remaining'),
    dayRemaining: intHeader(headers, 'x-daylimit-remaining'),
    appMinRemaining: intHeader(headers, 'x-appminlimit-remaining'),
    correlationId: header(headers, 'xero-correlation-id'),
  };
}
