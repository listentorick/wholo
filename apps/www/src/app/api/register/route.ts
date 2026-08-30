import { NextResponse } from 'next/server';

import { sendLeadEmail } from '@/lib/email';
import { submissionSchema } from '@/lib/lead-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-instance sliding-window rate limit. www runs a single replica; if it ever
// scales out, move this to a shared store.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 6;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_MAX;
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0]!.trim() : (req.headers.get('x-real-ip') ?? 'unknown');
}

const ok = (extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: true, ...extra });

export async function POST(req: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // Anti-spam: silently accept, send nothing. Bots learn nothing from a 200.
  if (typeof raw.company_url === 'string' && raw.company_url.trim() !== '') return ok();
  if (typeof raw.elapsedMs === 'number' && raw.elapsedMs < 2500) return ok();

  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  if (rateLimited(clientKey(req))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const { company_url: _hp, elapsedMs: _ms, ...lead } = parsed.data;

  try {
    await sendLeadEmail(lead);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== 'production') {
      // Local dev without MailHog reachable — don't block the flow.
      console.warn('[register] email send skipped (dev):', message);
      console.info('[register] lead:', lead);
      return ok({ dev: true });
    }
    console.error('[register] email send failed:', message);
    return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 });
  }

  return ok();
}
