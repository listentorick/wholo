/**
 * Integration tests for invoice payment facts (ADR-072): the raw upsert into
 * invoice_analytics_state and the hypertable insert run against real Postgres
 * + Timescale — replayed events are idempotent, and an older event arriving
 * late never regresses the state row.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { Test } from '@nestjs/testing';
import { OrganisationType } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvoiceFactsService, InvoiceEventPayload } from '../src/analytics-facts/invoice-facts.service';

const DIST_A = 'test-invfacts-dist-a';
const DIST_B = 'test-invfacts-dist-b';

describe('Invoice facts (integration)', () => {
  let prisma: PrismaService;
  let service: InvoiceFactsService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule], providers: [InvoiceFactsService] }).compile();
    prisma = module.get(PrismaService);
    service = module.get(InvoiceFactsService);
    close = () => module.close();
    for (const id of [DIST_A, DIST_B]) {
      await prisma.organisation.upsert({
        where: { id },
        create: { id, name: `Invoice Facts ${id}`, type: OrganisationType.DISTRIBUTOR },
        update: {},
      });
    }
  });

  const cleanup = async () => {
    await prisma.invoiceFact.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.invoiceAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  };
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await close();
  });

  const event = (over: Partial<InvoiceEventPayload> = {}): InvoiceEventPayload => ({
    exportId: 'exp-1',
    orderId: 'order-1',
    distributorId: DIST_A,
    customerId: 'cust-1',
    fromStatus: 'UNPAID',
    toStatus: 'PART_PAID',
    currency: 'GBP',
    total: '120.00',
    amountPaid: '50.00',
    amountDue: '70.00',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    fullyPaidOn: null,
    occurredAt: '2026-09-10T09:00:00.000Z',
    ...over,
  });

  it('records the fact and projects the state row', async () => {
    await service.handleInvoiceEvent('evt-1', 'InvoicePaymentStatusChanged', event());

    const facts = await prisma.invoiceFact.findMany({ where: { distributorId: DIST_A } });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ fromStatus: 'UNPAID', toStatus: 'PART_PAID' });
    const state = await prisma.invoiceAnalyticsState.findUniqueOrThrow({ where: { exportId: 'exp-1' } });
    expect(state.status).toBe('PART_PAID');
    expect(state.amountDue.toFixed(2)).toBe('70.00');
    expect(state.dueDate?.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('is idempotent on a replayed event', async () => {
    await service.handleInvoiceEvent('evt-1', 'InvoicePaymentStatusChanged', event());
    await service.handleInvoiceEvent('evt-1', 'InvoicePaymentStatusChanged', event());

    expect(await prisma.invoiceFact.count({ where: { distributorId: DIST_A } })).toBe(1);
  });

  it('never lets an older event regress the state', async () => {
    await service.handleInvoiceEvent(
      'evt-paid',
      'InvoicePaymentStatusChanged',
      event({ fromStatus: 'PART_PAID', toStatus: 'PAID', amountDue: '0', fullyPaidOn: '2026-09-20', occurredAt: '2026-09-20T09:00:00.000Z' }),
    );
    await service.handleInvoiceEvent('evt-part', 'InvoicePaymentStatusChanged', event());

    const state = await prisma.invoiceAnalyticsState.findUniqueOrThrow({ where: { exportId: 'exp-1' } });
    expect(state.status).toBe('PAID');
    expect(state.fullyPaidOn?.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(await prisma.invoiceFact.count({ where: { distributorId: DIST_A } })).toBe(2); // history keeps both
  });

  it("keeps each distributor's invoices separate", async () => {
    await service.handleInvoiceEvent('evt-a', 'InvoicePaymentStatusChanged', event());
    await service.handleInvoiceEvent('evt-b', 'InvoicePaymentStatusChanged', event({ exportId: 'exp-b', distributorId: DIST_B, toStatus: 'PAID' }));

    expect((await prisma.invoiceAnalyticsState.findMany({ where: { distributorId: DIST_A } })).map((s) => s.status)).toEqual(['PART_PAID']);
    expect((await prisma.invoiceAnalyticsState.findMany({ where: { distributorId: DIST_B } })).map((s) => s.status)).toEqual(['PAID']);
  });
});
