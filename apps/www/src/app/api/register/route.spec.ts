import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendLeadEmail = vi.fn<(lead: unknown) => Promise<void>>();
vi.mock('@/lib/email', () => ({ sendLeadEmail: (lead: unknown) => sendLeadEmail(lead) }));

import { POST } from './route';

const VALID = {
  name: 'Jo Smith',
  email: 'jo@winos.co.uk',
  business: 'Winos Ltd',
  role: 'Founder / owner',
  interests: ['Order accuracy'],
  message: '',
  elapsedMs: 6000,
};

function post(body: unknown, ip = '203.0.113.1') {
  return POST(
    new Request('http://localhost/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  sendLeadEmail.mockReset();
  sendLeadEmail.mockResolvedValue(undefined);
});

describe('POST /api/register', () => {
  it('accepts a valid submission and emails the lead without the anti-spam fields', async () => {
    const res = await post(VALID, '203.0.113.10');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(sendLeadEmail).toHaveBeenCalledOnce();
    const arg = sendLeadEmail.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({ name: 'Jo Smith', email: 'jo@winos.co.uk', business: 'Winos Ltd' });
    expect(arg).not.toHaveProperty('company_url');
    expect(arg).not.toHaveProperty('elapsedMs');
  });

  it('silently accepts a honeypot hit and sends nothing', async () => {
    const res = await post({ ...VALID, company_url: 'http://spam.example' }, '203.0.113.11');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(sendLeadEmail).not.toHaveBeenCalled();
  });

  it('silently accepts an implausibly fast submission and sends nothing', async () => {
    const res = await post({ ...VALID, elapsedMs: 400 }, '203.0.113.12');
    expect(res.status).toBe(200);
    expect(sendLeadEmail).not.toHaveBeenCalled();
  });

  it('rejects a missing email with 422 and a field error', async () => {
    const res = await post({ ...VALID, email: '' }, '203.0.113.13');
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string; fields: Record<string, string[]> };
    expect(json.error).toBe('validation');
    expect(json.fields.email?.[0]).toMatch(/email/i);
    expect(sendLeadEmail).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await post('{not json', '203.0.113.14');
    expect(res.status).toBe(400);
  });

  it('rate-limits repeated submissions from one client', async () => {
    const ip = '203.0.113.99';
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await post(VALID, ip)).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(6);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });

  it('does not fail the request in dev when email sending throws', async () => {
    sendLeadEmail.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await post(VALID, '203.0.113.20');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, dev: true });
  });
});
