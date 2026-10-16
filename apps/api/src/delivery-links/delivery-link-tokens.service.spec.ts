import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryLinkTokensService } from './delivery-link-tokens.service';

describe('DeliveryLinkTokensService', () => {
  describe('generate', () => {
    it('produces a 22-character base64url token (128 bits)', () => {
      const token = DeliveryLinkTokensService.generate();
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(16);
    });

    it('never repeats', () => {
      const tokens = new Set(Array.from({ length: 10_000 }, () => DeliveryLinkTokensService.generate()));
      expect(tokens.size).toBe(10_000);
    });
  });

  describe('isWellFormed', () => {
    it('accepts a generated token', () => {
      expect(DeliveryLinkTokensService.isWellFormed(DeliveryLinkTokensService.generate())).toBe(true);
    });

    it.each([
      ['empty', ''],
      ['too short', 'a'.repeat(21)],
      ['too long', 'a'.repeat(23)],
      ['padding', `${'a'.repeat(21)}=`],
      ['non-base64url characters', `${'a'.repeat(21)}+`],
      ['the old signed format', `cm1abc123def456ghi789jkl0.${'a'.repeat(86)}`],
    ])('rejects %s', (_case, token) => {
      expect(DeliveryLinkTokensService.isWellFormed(token)).toBe(false);
    });
  });

  describe('ensureFor', () => {
    // A tiny in-memory stand-in for the orders table, so the tests assert on
    // what ends up stored rather than on the calls made.
    let rows: Map<string, string | null>;
    let service: DeliveryLinkTokensService;

    beforeEach(async () => {
      rows = new Map();
      const prisma = {
        order: {
          findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.filter((id) => rows.has(id)).map((id) => ({ id, deliveryLinkToken: rows.get(id) ?? null })),
          ),
          updateMany: jest.fn(async ({ where, data }: { where: { id: string; deliveryLinkToken: null }; data: { deliveryLinkToken: string } }) => {
            if (rows.has(where.id) && rows.get(where.id) === null) {
              rows.set(where.id, data.deliveryLinkToken);
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      };
      const module = await Test.createTestingModule({
        providers: [DeliveryLinkTokensService, { provide: PrismaService, useValue: prisma }],
      }).compile();
      service = module.get(DeliveryLinkTokensService);
    });

    it('creates a token for each order that has none', async () => {
      rows.set('order-1', null).set('order-2', null);

      const tokens = await service.ensureFor(['order-1', 'order-2']);

      expect(DeliveryLinkTokensService.isWellFormed(tokens.get('order-1')!)).toBe(true);
      expect(DeliveryLinkTokensService.isWellFormed(tokens.get('order-2')!)).toBe(true);
      expect(tokens.get('order-1')).not.toBe(tokens.get('order-2'));
      expect(rows.get('order-1')).toBe(tokens.get('order-1'));
    });

    it('returns the same tokens on a reprint', async () => {
      rows.set('order-1', null);

      const first = await service.ensureFor(['order-1']);
      const second = await service.ensureFor(['order-1']);

      expect(second.get('order-1')).toBe(first.get('order-1'));
    });

    it('never replaces an existing token', async () => {
      const existing = DeliveryLinkTokensService.generate();
      rows.set('order-1', existing).set('order-2', null);

      const tokens = await service.ensureFor(['order-1', 'order-2']);

      expect(tokens.get('order-1')).toBe(existing);
      expect(rows.get('order-1')).toBe(existing);
    });
  });
});
