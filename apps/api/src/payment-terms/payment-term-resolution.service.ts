import { Injectable } from '@nestjs/common';
import { PaymentTerm, PaymentTermSource, PaymentTermType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { calculateDueDate } from './payment-terms.logic';
import { ACCOUNTING_SYSTEM_TERM_NAME } from './payment-terms.service';

type Db = PrismaService | Prisma.TransactionClient;

/** The Order columns frozen at acceptance (ADR-075). */
export interface OrderPaymentTermSnapshot {
  invoiceDate: Date;
  dueDate: Date | null;
  /** null when no term row was involved — the distributor never chose a default. */
  paymentTermIdSnapshot: string | null;
  paymentTermSnapshot: Prisma.InputJsonObject;
  paymentTermSourceSnapshot: PaymentTermSource;
}

const isoDate = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

/** The invoice/due dates carried on an OrderAccepted event. */
export function acceptedPaymentFields(snapshot: OrderPaymentTermSnapshot | null) {
  return snapshot ? { invoiceDate: isoDate(snapshot.invoiceDate), dueDate: isoDate(snapshot.dueDate) } : {};
}

/** The term that applies, or — with no default chosen — the built-in rule, unsaved. */
export type ResolvedPaymentTerm = Pick<PaymentTerm, 'name' | 'type' | 'days' | 'dayOfWeek' | 'dayOfMonth'> & {
  id: string | null;
};

const ACCOUNTING_SYSTEM_RULE: ResolvedPaymentTerm = {
  id: null,
  name: ACCOUNTING_SYSTEM_TERM_NAME,
  type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT,
  days: null,
  dayOfWeek: null,
  dayOfMonth: null,
};

/**
 * Works out which payment term applies to a customer and freezes the result
 * onto an order when it is accepted — the same override → default shape as
 * order acceptance mode (ADR-033), with the source recorded.
 *
 * Order: the customer's override (if still active) → the distributor default
 * (if still active) → the built-in "set by accounting software" rule. It
 * always resolves, so every accepted order records how its due date was
 * decided — including when the answer is "the accounting system decides".
 *
 * Read-only: accepting an order never creates rows. With no default chosen
 * the built-in rule is used without its PaymentTerm row (id null).
 */
@Injectable()
export class PaymentTermResolutionService {
  constructor(private prisma: PrismaService) {}

  async resolve(
    distributorId: string,
    traderCustomerId: string,
    db: Db = this.prisma,
  ): Promise<{ term: ResolvedPaymentTerm; source: PaymentTermSource }> {
    const [relationship, settings] = await Promise.all([
      db.tradeRelationship.findUnique({
        where: { distributorId_customerId: { distributorId, customerId: traderCustomerId } },
        select: { traderCustomerSettings: { select: { paymentTerm: true } } },
      }),
      db.distributorSettings.findUnique({ where: { distributorId }, select: { defaultPaymentTerm: true } }),
    ]);

    // distributorId is re-checked so a mis-assigned term can never apply
    // across distributors.
    const override = relationship?.traderCustomerSettings?.paymentTerm;
    if (override?.active && override.distributorId === distributorId) {
      return { term: override, source: PaymentTermSource.TRADER_CUSTOMER_OVERRIDE };
    }
    const fallback = settings?.defaultPaymentTerm;
    if (fallback?.active && fallback.distributorId === distributorId) {
      return { term: fallback, source: PaymentTermSource.DISTRIBUTOR_DEFAULT };
    }
    return { term: ACCOUNTING_SYSTEM_RULE, source: PaymentTermSource.DISTRIBUTOR_DEFAULT };
  }

  /**
   * The payment-term columns to write onto an order accepted at `acceptedAt`.
   * The invoice date is the acceptance day in the distributor's timezone.
   */
  async snapshotForAcceptance(
    distributorId: string,
    traderCustomerId: string,
    acceptedAt: Date,
    db: Db = this.prisma,
  ): Promise<OrderPaymentTermSnapshot> {
    const [{ term, source }, settings] = await Promise.all([
      this.resolve(distributorId, traderCustomerId, db),
      db.distributorSettings.findUnique({ where: { distributorId }, select: { timezone: true } }),
    ]);
    const invoiceDate = distributorLocalDate(acceptedAt, settings?.timezone ?? 'UTC');
    return {
      invoiceDate,
      dueDate: calculateDueDate(term, invoiceDate),
      paymentTermIdSnapshot: term.id,
      paymentTermSnapshot: {
        name: term.name,
        type: term.type,
        days: term.days,
        dayOfWeek: term.dayOfWeek,
        dayOfMonth: term.dayOfMonth,
      },
      paymentTermSourceSnapshot: source,
    };
  }
}
