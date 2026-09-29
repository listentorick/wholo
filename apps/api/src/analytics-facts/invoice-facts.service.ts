import { Injectable, Logger } from '@nestjs/common';
import { InvoicePaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { INVOICE_PAYMENT_STATUS_CHANGED } from '../accounting/invoice-payment-status';

export const INVOICE_EVENT_TYPES = new Set<string>([INVOICE_PAYMENT_STATUS_CHANGED]);

// Payload written by AccountingInvoiceSyncProcessor (ADR-072).
export interface InvoiceEventPayload {
  exportId?: string;
  orderId?: string;
  distributorId?: string;
  customerId?: string;
  fromStatus?: InvoicePaymentStatus;
  toStatus?: InvoicePaymentStatus;
  currency?: string;
  total?: string;
  amountPaid?: string;
  amountDue?: string;
  issueDate?: string | null; // YYYY-MM-DD
  dueDate?: string | null;
  fullyPaidOn?: string | null;
  occurredAt?: string;
}

const calendarDate = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

// Consumes invoice payment-status changes into invoice_facts (append-only)
// and invoice_analytics_state (one row per exported invoice), mirroring the
// relationship facts (ADR-070). Idempotent on eventId; the state row only
// moves forward in provider time, so events arriving out of order can't
// regress it.
@Injectable()
export class InvoiceFactsService {
  private readonly logger = new Logger(InvoiceFactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleInvoiceEvent(eventId: string, eventType: string, payload: InvoiceEventPayload): Promise<void> {
    const { exportId, orderId, distributorId, customerId, fromStatus, toStatus, occurredAt: occurredAtIso } = payload;
    if (!exportId || !orderId || !distributorId || !customerId || !fromStatus || !toStatus || !occurredAtIso) {
      this.logger.warn(
        { event: 'analytics.invoice_fact.skipped', eventId, eventType, reason: 'missing_fields' },
        `Event ${eventId} (${eventType}) has no invoice payment fields — skipping`,
      );
      return;
    }
    const occurredAt = new Date(occurredAtIso);
    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { timezone: true },
    });
    const localDate = distributorLocalDate(occurredAt, settings?.timezone ?? 'UTC');
    const currency = payload.currency ?? 'GBP';
    const total = payload.total ?? '0';
    const amountDue = payload.amountDue ?? '0';
    const issueDate = calendarDate(payload.issueDate);
    const dueDate = calendarDate(payload.dueDate);
    const fullyPaidOn = calendarDate(payload.fullyPaidOn);

    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.invoiceFact.create({
          data: {
            eventId,
            distributorId,
            exportId,
            orderId,
            customerId,
            fromStatus,
            toStatus,
            currency,
            total,
            amountPaid: payload.amountPaid ?? '0',
            amountDue,
            issueDate,
            dueDate,
            fullyPaidOn,
            occurredAt,
            distributorLocalDate: localDate,
          },
        });
      } catch (err) {
        // Replayed event: the fact and its state change already committed together.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.log(
            { event: 'analytics.invoice_fact.replayed', eventId },
            `Event ${eventId} already recorded as an invoice fact — skipping (idempotent replay)`,
          );
          return;
        }
        throw err;
      }

      // Project the state row with Prisma's own queries — no raw SQL. Insert if
      // absent (ON CONFLICT DO NOTHING, so a concurrent insert can't abort the
      // transaction), then update only when this event is newer than what the
      // row holds, so an older event arriving late never regresses it.
      const projected = {
        status: toStatus,
        total,
        amountDue,
        issueDate,
        dueDate,
        fullyPaidOn,
        lastEventAt: occurredAt,
      };
      const inserted = await tx.invoiceAnalyticsState.createMany({
        data: [{ exportId, distributorId, customerId, orderId, currency, ...projected }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        await tx.invoiceAnalyticsState.updateMany({
          where: { exportId, lastEventAt: { lt: occurredAt } },
          data: projected,
        });
      }
    });
  }
}
