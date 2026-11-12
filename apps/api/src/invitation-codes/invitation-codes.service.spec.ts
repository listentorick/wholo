import { BadRequestException, HttpException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CODE_TTL_MINUTES,
  InvitationCodesService,
  MAX_CODE_ATTEMPTS,
  MAX_CODES_PER_INVITATION,
  RESEND_COOLDOWN_MS,
  SendCodeInput,
} from './invitation-codes.service';

interface Row {
  id: string;
  customerInvitationId: string | null;
  staffInvitationId: string | null;
  keycloakSub: string;
  claimantEmail: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  sendCount: number;
  lastSentAt: Date | null;
  consumedAt: Date | null;
}

/** A tiny in-memory stand-in for the invitationEmailCode table. */
function fakeStore() {
  const rows: Row[] = [];
  let next = 1;
  const keyOf = (where: Record<string, unknown>) => {
    if (typeof where.id === 'string') return (r: Row) => r.id === where.id;
    const [name, v] = Object.entries(where as Record<string, { [k: string]: string }>)[0];
    const field = name.startsWith('customer') ? 'customerInvitationId' : 'staffInvitationId';
    return (r: Row) => r[field] === v[field] && r.keycloakSub === v.keycloakSub;
  };
  const apply = (r: Row, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in (v as object)) {
        (r as unknown as Record<string, number>)[k] += (v as { increment: number }).increment;
      } else {
        (r as unknown as Record<string, unknown>)[k] = v;
      }
    }
    return r;
  };
  /** Prisma-style filter: plain equality, or { lt } / { gt } on numbers and dates. */
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, cond]) => {
      const value = (r as unknown as Record<string, unknown>)[k];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as { lt?: number | Date; gt?: number | Date };
        if (c.lt !== undefined) return Number(value) < Number(c.lt);
        if (c.gt !== undefined) return Number(value) > Number(c.gt);
      }
      return value === cond;
    });
  const table = {
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find(keyOf(where)) ?? null),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const found = rows.find(keyOf(where));
      if (!found) throw new Error('not found');
      return found;
    }),
    aggregate: jest.fn(async ({ where }: { where: Partial<Row> }) => ({
      _sum: {
        sendCount: rows
          .filter((r) => Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
          .reduce((n, r) => n + r.sendCount, 0),
      },
    })),
    upsert: jest.fn(async ({ where, create, update }: { where: Record<string, { [k: string]: string }>; create: Partial<Row>; update: Partial<Row> }) => {
      const found = rows.find(keyOf(where));
      if (found) return apply(found, update);
      const defaults: Partial<Row> = {
        id: `code-${next++}`, customerInvitationId: null, staffInvitationId: null, attempts: 0, sendCount: 0,
        lastSentAt: null, consumedAt: null,
      };
      const row = { ...defaults, ...create } as Row;
      rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      apply(rows.find((r) => r.id === where.id)!, data)),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => apply(r, data));
      return { count: hit.length };
    }),
  };
  return { rows, prisma: { invitationEmailCode: table } };
}

const input = (overrides: Partial<SendCodeInput> = {}): SendCodeInput => ({
  kind: 'CUSTOMER',
  invitationId: 'inv-1',
  invitedEmail: 'orders@rustyanchor.test',
  claimant: { sub: 'sub-rick', email: 'rick@rustyanchor.test' },
  businessName: 'The Rusty Anchor',
  inviterName: 'Vine & Co',
  ...overrides,
});

describe('InvitationCodesService', () => {
  let service: InvitationCodesService;
  let store: ReturnType<typeof fakeStore>;
  let mail: { sendInvitationCode: jest.Mock };

  const lastCode = () => mail.sendInvitationCode.mock.calls.at(-1)![1].code as string;
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  beforeEach(async () => {
    jest.useRealTimers();
    store = fakeStore();
    mail = { sendInvitationCode: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        InvitationCodesService,
        { provide: PrismaService, useValue: store.prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = module.get(InvitationCodesService);
  });

  describe('send', () => {
    it('emails a six-digit code to the invited address, naming the signed-in account', async () => {
      const result = await service.send(input());

      expect(result).toEqual({ sentTo: 'orders@rustyanchor.test', expiresInMinutes: CODE_TTL_MINUTES });
      const [to, params] = mail.sendInvitationCode.mock.calls[0];
      expect(to).toBe('orders@rustyanchor.test');
      expect(params).toMatchObject({ claimantEmail: 'rick@rustyanchor.test', businessName: 'The Rusty Anchor', inviterName: 'Vine & Co' });
      expect(params.code).toMatch(/^\d{6}$/);
    });

    it('never stores the code itself', async () => {
      await service.send(input());
      expect(JSON.stringify(store.rows)).not.toContain(lastCode());
    });

    it('refuses when the signed-in address already is the invited one (case-insensitive)', async () => {
      await expect(service.send(input({ claimant: { sub: 's', email: 'Orders@RustyAnchor.test' } }))).rejects.toThrow(BadRequestException);
      expect(mail.sendInvitationCode).not.toHaveBeenCalled();
    });

    it('refuses a second code within a minute', async () => {
      await service.send(input());
      await expect(service.send(input())).rejects.toMatchObject({ status: 429 });
    });

    it('allows a new code after the cooldown, and the old one stops working', async () => {
      await service.send(input());
      const first = lastCode();
      store.rows[0].lastSentAt = new Date(Date.now() - RESEND_COOLDOWN_MS - 1);
      await service.send(input());
      const second = lastCode();

      if (first !== second) {
        await expect(service.check({ kind: 'CUSTOMER', invitationId: 'inv-1', sub: 'sub-rick', code: first })).rejects.toThrow(UnprocessableEntityException);
      }
      await expect(service.check({ kind: 'CUSTOMER', invitationId: 'inv-1', sub: 'sub-rick', code: second })).resolves.toBe(store.rows[0].id);
    });

    it(`stops after ${MAX_CODES_PER_INVITATION} codes for one invitation, across accounts`, async () => {
      store.rows.push({
        id: 'other', customerInvitationId: 'inv-1', staffInvitationId: null, keycloakSub: 'sub-other', claimantEmail: 'x@y.test',
        codeHash: 'h', expiresAt: new Date(), attempts: 0, sendCount: MAX_CODES_PER_INVITATION, lastSentAt: new Date(0), consumedAt: null,
      });
      await expect(service.send(input())).rejects.toMatchObject({ status: 429 });
    });

    it('reports a failed email, and does not count it against the cooldown', async () => {
      mail.sendInvitationCode.mockRejectedValueOnce(new Error('SMTP down'));
      await expect(service.send(input())).rejects.toThrow(ServiceUnavailableException);
      await expect(service.send(input())).resolves.toMatchObject({ sentTo: 'orders@rustyanchor.test' });
    });
  });

  describe('check and consume', () => {
    const check = (code: string, overrides: Partial<{ sub: string; invitationId: string; kind: 'CUSTOMER' | 'STAFF' }> = {}) =>
      service.check({ kind: 'CUSTOMER', invitationId: 'inv-1', sub: 'sub-rick', code, ...overrides });

    it('accepts the right code for the same invitation and account', async () => {
      await service.send(input());
      await expect(check(lastCode())).resolves.toBe(store.rows[0].id);
    });

    it('accepts the code with spaces in it', async () => {
      await service.send(input());
      const code = lastCode();
      await expect(check(`${code.slice(0, 3)} ${code.slice(3)}`)).resolves.toBe(store.rows[0].id);
    });

    it('refuses the right code from another account', async () => {
      await service.send(input());
      await expect(check(lastCode(), { sub: 'sub-mallory' })).rejects.toThrow('No code has been sent to you');
    });

    it('refuses the right code on another invitation, or the staff invitation with the same id', async () => {
      await service.send(input());
      await expect(check(lastCode(), { invitationId: 'inv-2' })).rejects.toThrow(UnprocessableEntityException);
      await expect(check(lastCode(), { kind: 'STAFF' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('counts wrong codes and says how many tries are left', async () => {
      await service.send(input());
      await expect(check(wrong(lastCode()))).rejects.toThrow(`${MAX_CODE_ATTEMPTS - 1} tries left`);
      expect(store.rows[0].attempts).toBe(1);
    });

    it(`locks the code after ${MAX_CODE_ATTEMPTS} wrong tries, even for the right code`, async () => {
      await service.send(input());
      const code = lastCode();
      for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
        await expect(check(wrong(code))).rejects.toThrow(UnprocessableEntityException);
      }
      await expect(check(code)).rejects.toThrow('Too many wrong codes');
    });

    it('refuses an expired code', async () => {
      await service.send(input());
      store.rows[0].expiresAt = new Date(Date.now() - 1);
      await expect(check(lastCode())).rejects.toThrow('expired');
    });

    it('refuses before any code was sent', async () => {
      await expect(check('123456')).rejects.toThrow('Send a code first');
    });

    it('lets a right code through without counting it against the next one', async () => {
      await service.send(input());
      await expect(check(wrong(lastCode()))).rejects.toThrow(UnprocessableEntityException);
      await expect(check(lastCode())).resolves.toBe(store.rows[0].id);
    });

    it('never compares more guesses than the limit, even when they arrive at once', async () => {
      await service.send(input());
      const code = lastCode();
      const guesses = Array.from({ length: 20 }, () => check(wrong(code)).catch((e: Error) => e.message));

      const answers = await Promise.all(guesses);

      expect(answers.filter((m) => m.startsWith("That code isn't right"))).toHaveLength(MAX_CODE_ATTEMPTS);
      expect(answers.filter((m) => m.startsWith('Too many wrong codes'))).toHaveLength(20 - MAX_CODE_ATTEMPTS);
      expect(store.rows[0].attempts).toBe(MAX_CODE_ATTEMPTS);
    });

    it('uses a code once', async () => {
      await service.send(input());
      const id = await check(lastCode());
      await service.consume(store.prisma as never, id);
      await expect(service.consume(store.prisma as never, id)).rejects.toThrow('already been used');
      await expect(check(lastCode())).rejects.toThrow(UnprocessableEntityException);
    });

    it('is a 429 HttpException for the cooldown, not a validation error', async () => {
      await service.send(input());
      const err = await service.send(input()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
    });
  });
});
