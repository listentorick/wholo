import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountingConnectionStatus, PaymentTerm, PaymentTermType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { CreatePaymentTermDto, PaymentTermRuleDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { calculateDueDate, describeRule, normaliseRule, PaymentTermRule } from './payment-terms.logic';

type Db = PrismaService | Prisma.TransactionClient;

export const ACCOUNTING_SYSTEM_TERM_KEY = 'ACCOUNTING_SYSTEM_DEFAULT';
export const ACCOUNTING_SYSTEM_TERM_NAME = 'Set by accounting software';

const isoDate = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

function ruleOf(term: Pick<PaymentTerm, 'type' | 'days' | 'dayOfWeek' | 'dayOfMonth'>): PaymentTermRule {
  return { type: term.type, days: term.days, dayOfWeek: term.dayOfWeek, dayOfMonth: term.dayOfMonth };
}

function ruleOrThrow(input: PaymentTermRuleDto): PaymentTermRule {
  const result = normaliseRule({
    type: input.type,
    days: input.days ?? null,
    dayOfWeek: input.dayOfWeek ?? null,
    dayOfMonth: input.dayOfMonth ?? null,
  });
  if ('error' in result) throw new BadRequestException(result.error);
  return result.rule;
}

/**
 * Named payment terms a distributor offers its customers (ADR-075): one
 * built-in "Set by accounting software" term plus any the distributor makes.
 * The distributor default lives on DistributorSettings.defaultPaymentTermId.
 */
@Injectable()
export class PaymentTermsService {
  constructor(private prisma: PrismaService) {}

  /**
   * The distributor's built-in "let the accounting software decide" term,
   * created the first time anything asks for it.
   *
   * Insert-ignoring-duplicates then read, not `upsert`: Prisma's upsert can
   * lose a concurrent first-use race and throw on the (distributorId,
   * systemKey) unique key. ON CONFLICT DO NOTHING cannot.
   */
  async ensureSystemTerm(distributorId: string, db: Db = this.prisma): Promise<PaymentTerm> {
    const where = { distributorId_systemKey: { distributorId, systemKey: ACCOUNTING_SYSTEM_TERM_KEY } };
    const existing = await db.paymentTerm.findUnique({ where });
    if (existing) return existing;
    await db.paymentTerm.createMany({
      data: [
        {
          distributorId,
          systemKey: ACCOUNTING_SYSTEM_TERM_KEY,
          name: ACCOUNTING_SYSTEM_TERM_NAME,
          type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT,
        },
      ],
      skipDuplicates: true,
    });
    return db.paymentTerm.findUniqueOrThrow({ where });
  }

  async findAll(distributorId: string) {
    const systemTerm = await this.ensureSystemTerm(distributorId);
    const [terms, settings, connection] = await Promise.all([
      this.prisma.paymentTerm.findMany({
        where: { distributorId },
        include: { _count: { select: { customerSettings: { where: { tradeRelationship: { deletedAt: null } } } } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { defaultPaymentTermId: true } }),
      this.prisma.accountingConnection.findFirst({
        where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
        select: { provider: true },
      }),
    ]);
    const defaultId = this.effectiveDefaultId(settings?.defaultPaymentTermId, terms, systemTerm.id);
    // The distributor's own terms in creation order, then the built-in
    // "accounting integration manages it" term.
    const ordered = [...terms.filter((t) => !t.systemKey), ...terms.filter((t) => t.systemKey)];
    return {
      data: ordered.map((t) => this.format(t, defaultId, t._count.customerSettings)),
      defaultPaymentTermId: defaultId,
      // Which integration the built-in term hands the due date to — the UI
      // names it ("Xero manages due date") and hides the term when null.
      accountingProvider: connection?.provider ?? null,
    };
  }

  async findOne(id: string, distributorId: string) {
    const term = await this.prisma.paymentTerm.findFirst({
      where: { id, distributorId },
      include: { _count: { select: { customerSettings: { where: { tradeRelationship: { deletedAt: null } } } } } },
    });
    if (!term) throw new NotFoundException('Payment term not found');
    return this.format(term, await this.defaultId(distributorId), term._count.customerSettings);
  }

  async create(distributorId: string, dto: CreatePaymentTermDto) {
    const rule = ruleOrThrow(dto);
    const term = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentTerm.create({ data: { distributorId, name: dto.name, ...rule } });
      if (dto.makeDefault) await this.writeDefault(tx, distributorId, created.id);
      return created;
    });
    return this.findOne(term.id, distributorId);
  }

  async update(id: string, distributorId: string, dto: UpdatePaymentTermDto) {
    const existing = await this.getOwned(id, distributorId);
    if (dto.isDefault === false) {
      throw new BadRequestException('To change the default, make another payment term the default');
    }
    const { isDefault, ...changes } = dto;
    const hasChanges = Object.values(changes).some((v) => v !== undefined);
    if (existing.systemKey && hasChanges) {
      throw new UnprocessableEntityException('The accounting-software term is built in and cannot be changed');
    }
    if (dto.active === false) {
      if (isDefault) throw new UnprocessableEntityException('An inactive payment term cannot be the default');
      return this.deactivate(id, distributorId);
    }
    if (!hasChanges) return isDefault ? this.setDefault(id, distributorId) : this.findOne(id, distributorId);

    const ruleChanged = [dto.type, dto.days, dto.dayOfWeek, dto.dayOfMonth].some((v) => v !== undefined);
    const rule = ruleChanged
      ? ruleOrThrow({
          type: dto.type ?? existing.type,
          days: dto.days !== undefined ? dto.days : existing.days,
          dayOfWeek: dto.dayOfWeek !== undefined ? dto.dayOfWeek : existing.dayOfWeek,
          dayOfMonth: dto.dayOfMonth !== undefined ? dto.dayOfMonth : existing.dayOfMonth,
        })
      : {};
    await this.prisma.paymentTerm.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.active === true && { active: true }),
        ...rule,
      },
    });
    return isDefault ? this.setDefault(id, distributorId) : this.findOne(id, distributorId);
  }

  async setDefault(id: string, distributorId: string) {
    const term = await this.getOwned(id, distributorId);
    if (!term.active) throw new UnprocessableEntityException('An inactive payment term cannot be the default');
    await this.writeDefault(this.prisma, distributorId, id);
    return this.findOne(id, distributorId);
  }

  /**
   * Soft delete — orders keep the term's id in their snapshot. Customers on
   * the term move to the distributor default (their override is cleared, so
   * reactivating the term later doesn't silently move them back).
   */
  async deactivate(id: string, distributorId: string) {
    const term = await this.getOwned(id, distributorId);
    if (term.systemKey) {
      throw new UnprocessableEntityException('The accounting-software term is built in and cannot be deactivated');
    }
    if ((await this.defaultId(distributorId)) === id) {
      throw new UnprocessableEntityException('Choose another default payment term before deactivating this one');
    }
    await this.prisma.$transaction([
      this.prisma.traderCustomerSettings.updateMany({ where: { paymentTermId: id }, data: { paymentTermId: null } }),
      this.prisma.paymentTerm.update({ where: { id }, data: { active: false } }),
    ]);
    return this.findOne(id, distributorId);
  }

  /**
   * What a rule would do, for the editor's live preview: an invoice dated
   * today (distributor time), at the end of this month and at the start of
   * next month — enough to show month-end and short-month behaviour.
   */
  async preview(distributorId: string, dto: PaymentTermRuleDto) {
    const rule = ruleOrThrow(dto);
    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { timezone: true },
    });
    const today = distributorLocalDate(new Date(), settings?.timezone ?? 'UTC');
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const candidates = [today, new Date(Date.UTC(y, m + 1, 0)), new Date(Date.UTC(y, m + 1, 1))];
    // Today may itself be the month end — show it once.
    const invoiceDates = [...new Map(candidates.map((date) => [isoDate(date), date])).values()];
    return {
      summary: describeRule(rule),
      examples: invoiceDates.map((invoiceDate) => ({
        invoiceDate: isoDate(invoiceDate),
        dueDate: isoDate(calculateDueDate(rule, invoiceDate)),
      })),
    };
  }

  /** Throws 404 for a term that doesn't exist or belongs to another distributor. */
  async getOwned(id: string, distributorId: string) {
    const term = await this.prisma.paymentTerm.findFirst({ where: { id, distributorId } });
    if (!term) throw new NotFoundException('Payment term not found');
    return term;
  }

  private async writeDefault(db: Db, distributorId: string, termId: string) {
    await db.distributorSettings.upsert({
      where: { distributorId },
      create: { distributorId, defaultPaymentTermId: termId },
      update: { defaultPaymentTermId: termId },
    });
  }

  private async defaultId(distributorId: string): Promise<string> {
    const [settings, systemTerm] = await Promise.all([
      this.prisma.distributorSettings.findUnique({
        where: { distributorId },
        select: { defaultPaymentTerm: { select: { id: true, active: true } } },
      }),
      this.ensureSystemTerm(distributorId),
    ]);
    const chosen = settings?.defaultPaymentTerm;
    return chosen?.active ? chosen.id : systemTerm.id;
  }

  // No default chosen (or it was somehow deactivated) means the built-in term.
  private effectiveDefaultId(chosenId: string | null | undefined, terms: PaymentTerm[], systemId: string) {
    const chosen = terms.find((t) => t.id === chosenId);
    return chosen?.active ? chosen.id : systemId;
  }

  private format(term: PaymentTerm, defaultId: string, customerCount: number) {
    return {
      id: term.id,
      distributorId: term.distributorId,
      name: term.name,
      type: term.type,
      days: term.days,
      dayOfWeek: term.dayOfWeek,
      dayOfMonth: term.dayOfMonth,
      summary: describeRule(ruleOf(term)),
      isSystem: term.systemKey !== null,
      isDefault: term.id === defaultId,
      active: term.active,
      customerCount,
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    };
  }
}
