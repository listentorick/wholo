import { BadRequestException } from '@nestjs/common';
import { DeliveryOutcomesService, MAX_OUTCOME_WINDOW_DAYS } from './delivery-outcomes.service';
import { PrismaService } from '../prisma/prisma.service';

// The on-time / late / failed classification runs in SQL and is proven against a
// real database in test/delivery-overview.integration-spec.ts.
function make(rows: Array<{ day: Date; onTime: number; late: number; failed: number }> = [], timezone: string | null = 'Europe/London') {
  const prisma = {
    distributorSettings: { findUnique: jest.fn().mockResolvedValue(timezone ? { timezone } : null) },
    $queryRaw: jest.fn().mockResolvedValue(rows),
  };
  return new DeliveryOutcomesService(prisma as unknown as PrismaService);
}
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('DeliveryOutcomesService', () => {
  it('returns one entry per day in the window, zero-filled where nothing happened', async () => {
    const service = make([{ day: d('2026-09-12'), onTime: 40, late: 3, failed: 1 }]);

    const result = await service.getDays('dist-1', '2026-09-11', '2026-09-13');

    expect(result).toEqual({
      distributorId: 'dist-1', from: '2026-09-11', to: '2026-09-13', timezone: 'Europe/London',
      days: [
        { date: '2026-09-11', onTime: 0, late: 0, failed: 0 },
        { date: '2026-09-12', onTime: 40, late: 3, failed: 1 },
        { date: '2026-09-13', onTime: 0, late: 0, failed: 0 },
      ],
    });
  });

  it('accepts a single-day window and the maximum window', async () => {
    const service = make();
    expect((await service.getDays('dist-1', '2026-09-12', '2026-09-12')).days).toHaveLength(1);
    expect((await service.getDays('dist-1', '2026-06-18', '2026-09-17')).days).toHaveLength(MAX_OUTCOME_WINDOW_DAYS);
  });

  it('falls back to UTC for a distributor with no settings row', async () => {
    expect((await make([], null).getDays('dist-1', '2026-09-12', '2026-09-12')).timezone).toBe('UTC');
  });

  it.each([
    ['a window longer than the maximum', '2026-06-17', '2026-09-17'],
    ['a window that ends before it starts', '2026-09-13', '2026-09-12'],
    ['a date that is not on the calendar', '2026-02-30', '2026-03-05'],
  ])('rejects %s', async (_label, from, to) => {
    await expect(make().getDays('dist-1', from, to)).rejects.toThrow(BadRequestException);
  });
});
