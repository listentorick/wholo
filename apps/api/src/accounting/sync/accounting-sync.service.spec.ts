import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { IngestionRunService } from '../../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting-connection.service';
import { AccountingSyncService, nextSlotAfter } from './accounting-sync.service';

const MIN = 60_000;

describe('nextSlotAfter', () => {
  const slot = new Date('2026-09-29T10:17:00Z');

  it('moves exactly one interval on when the slot has just passed', () => {
    expect(nextSlotAfter(slot, new Date('2026-09-29T10:17:30Z'), 30 * MIN)).toEqual(new Date('2026-09-29T10:47:00Z'));
  });

  it('stays on its own grid after an outage, skipping the missed slots instead of replaying them', () => {
    // Down from 10:17 to 12:05: slots 10:47, 11:17, 11:47 were missed.
    expect(nextSlotAfter(slot, new Date('2026-09-29T12:05:00Z'), 30 * MIN)).toEqual(new Date('2026-09-29T12:17:00Z'));
  });

  it('is always strictly in the future, even exactly on a slot boundary', () => {
    expect(nextSlotAfter(slot, new Date('2026-09-29T10:47:00Z'), 30 * MIN)).toEqual(new Date('2026-09-29T11:17:00Z'));
  });
});

describe('AccountingSyncService', () => {
  let service: AccountingSyncService;
  let requestRun: jest.Mock;
  let writeEvent: jest.Mock;
  let advanceSchedule: jest.Mock;

  beforeEach(() => {
    requestRun = jest.fn();
    writeEvent = jest.fn().mockResolvedValue(undefined);
    advanceSchedule = jest.fn().mockResolvedValue(undefined);
    const prisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})) };
    const ingestionRuns = { requestRun, advanceSchedule, listRuns: jest.fn().mockResolvedValue([]) };
    const connections = {
      getActiveConnectionOrThrow: jest.fn().mockResolvedValue({ id: 'conn-1', provider: 'XERO' }),
      getCurrentConnection: jest.fn().mockResolvedValue({ id: 'conn-1' }),
    };
    service = new AccountingSyncService(
      prisma as unknown as PrismaService,
      { writeEvent } as unknown as OutboxService,
      ingestionRuns as unknown as IngestionRunService,
      connections as unknown as AccountingConnectionService,
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('requestSync (manual)', () => {
    it('writes one outbox event per resource type that was not already in flight', async () => {
      requestRun
        .mockResolvedValueOnce({ run: { id: 'r-contact' }, shouldEnqueue: true })
        .mockResolvedValueOnce({ run: { id: 'r-product' }, shouldEnqueue: false })
        .mockResolvedValueOnce({ run: { id: 'r-tax' }, shouldEnqueue: true })
        .mockResolvedValueOnce({ run: { id: 'r-invoice' }, shouldEnqueue: true });

      await service.requestSync('dist-1', 'MANUAL');

      expect(writeEvent).toHaveBeenCalledTimes(3);
      expect(writeEvent.mock.calls.map((c) => c[3])).toEqual([
        'AccountingContactSyncRequested',
        'AccountingTaxTypeSyncRequested',
        'AccountingInvoiceSyncRequested', // a manual Sync refreshes payment status too
      ]);
    });

    it('a double click queues nothing the second time', async () => {
      requestRun.mockResolvedValue({ run: { id: 'r' }, shouldEnqueue: false });

      await service.requestSync('dist-1', 'MANUAL');

      expect(writeEvent).not.toHaveBeenCalled();
    });
  });

  describe('enqueueDue (scheduler)', () => {
    it('queues the run and moves its slot on', async () => {
      requestRun.mockResolvedValue({ run: { id: 'run-1' }, shouldEnqueue: true });
      const now = new Date('2026-09-29T10:18:00Z');

      const result = await service.enqueueDue('dist-1', 'conn-1', 'contact', new Date('2026-09-29T10:17:00Z'), now);

      expect(result).toEqual({ enqueued: true, nextRunAt: new Date('2026-09-29T10:47:00Z') });
      expect(writeEvent).toHaveBeenCalledTimes(1);
      expect(advanceSchedule).toHaveBeenCalledWith(expect.anything(), 'run-1', new Date('2026-09-29T10:47:00Z'));
    });

    it('advances the slot but queues nothing when a run is already in flight', async () => {
      requestRun.mockResolvedValue({ run: { id: 'run-1' }, shouldEnqueue: false });

      const result = await service.enqueueDue('dist-1', 'conn-1', 'contact', new Date('2026-09-29T10:17:00Z'), new Date('2026-09-29T10:18:00Z'));

      expect(result.enqueued).toBe(false);
      expect(writeEvent).not.toHaveBeenCalled();
      expect(advanceSchedule).toHaveBeenCalled();
    });

    it('schedules a never-run triple one interval from now', async () => {
      requestRun.mockResolvedValue({ run: { id: 'run-new' }, shouldEnqueue: true });
      const now = new Date('2026-09-29T10:00:00Z');

      const result = await service.enqueueDue('dist-1', 'conn-1', 'tax_type', null, now);

      expect(result.nextRunAt).toEqual(new Date('2026-09-29T16:00:00Z')); // tax types: every 6 h
    });
  });

  describe('getStatus', () => {
    it('shows the mapping pulls only — the invoice status sync has nothing to review', async () => {
      const run = (resourceType: string) => ({
        id: resourceType,
        resourceType,
        status: 'COMPLETED',
        queuedAt: new Date(),
        finishedAt: new Date(),
        startedAt: null,
      });
      (service as unknown as { ingestionRuns: { listRuns: jest.Mock } }).ingestionRuns.listRuns.mockResolvedValue([
        run('contact'),
        run('invoice'),
      ]);

      const status = await service.getStatus('dist-1');

      expect(status.runs.map((r) => r.resourceType)).toEqual(['contact']);
    });
  });
});
