import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountingTaxTypeMatchMethod, AccountingTaxTypeMatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { TaxTypesService } from '../tax-types/tax-types.service';
import { AccountingTaxTypeService } from './accounting-tax-type.service';

function makePrismaMock() {
  const prisma: any = {
    accountingConnection: { findFirst: jest.fn() },
    externalAccountingTaxType: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    taxTypeAccountingMapping: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    accountingTaxTypeMatchSuggestion: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    taxType: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

const activeConnection = { id: 'conn-1', distributorId: 'dist-1', status: 'CONNECTED' };

describe('AccountingTaxTypeService', () => {
  let service: AccountingTaxTypeService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let outbox: { writeEvent: jest.Mock };
  let taxTypes: { create: jest.Mock };

  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
    outbox = { writeEvent: jest.fn().mockResolvedValue({}) };
    taxTypes = { create: jest.fn().mockResolvedValue({ id: 'tt-new', name: 'Standard rate' }) };
    service = new AccountingTaxTypeService(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
      taxTypes as unknown as TaxTypesService,
    );
  });

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ext-1',
      taxType: 'OUTPUT2',
      displayName: 'Standard rate',
      ratePercentage: new Prisma.Decimal('20.0000'),
      isActive: true,
      ignoredAt: null,
      changeDetectedAt: null,
      changeAcknowledgedAt: null,
      mappings: [],
      suggestions: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  describe('listTaxTypes', () => {
    it('throws NotFoundException when the distributor has no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.listTaxTypes('dist-1', {})).rejects.toThrow(NotFoundException);
    });

    it('computes READY_TO_IMPORT for an unmapped, unsuggested, active row', async () => {
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([row()]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].status).toBe('READY_TO_IMPORT');
    });

    it('computes INACTIVE for an unmapped row no longer active in the provider', async () => {
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([row({ isActive: false })]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].status).toBe('INACTIVE');
    });

    it('computes IGNORED for a row the admin explicitly ignored', async () => {
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([row({ ignoredAt: new Date('2026-01-02') })]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].status).toBe('IGNORED');
    });

    it('computes LINKED when an active mapping exists', async () => {
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([
        row({
          mappings: [
            {
              id: 'map-1',
              taxTypeId: 'tt-1',
              taxType: { id: 'tt-1', name: 'Standard rate' },
              matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
              linkedAt: new Date('2026-01-02'),
            },
          ],
        }),
      ]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].status).toBe('LINKED');
      expect(result.data[0].mapping).toMatchObject({ id: 'map-1', taxTypeId: 'tt-1', taxTypeName: 'Standard rate' });
    });

    it('computes SUGGESTED when a suggestion exists and is not conflicted', async () => {
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([
        row({
          suggestions: [
            {
              id: 'sug-1',
              suggestedTaxTypeId: 'tt-1',
              suggestedTaxType: { id: 'tt-1', name: 'Standard rate' },
              confidence: 90,
              matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
              matchReason: 'Exact name match',
            },
          ],
        }),
      ]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].status).toBe('SUGGESTED');
      expect(result.data[0].suggestion).toMatchObject({ id: 'sug-1', taxTypeId: 'tt-1', taxTypeName: 'Standard rate' });
    });

    it('computes CONFLICT when two rows suggest the same Wholo tax type', async () => {
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([
        row({
          suggestions: [
            {
              id: 'sug-1',
              suggestedTaxTypeId: 'tt-1',
              suggestedTaxType: { id: 'tt-1', name: 'Standard rate' },
              confidence: 60,
              matchMethod: AccountingTaxTypeMatchMethod.NAME_FUZZY,
              matchReason: 'Similar name',
            },
          ],
        }),
      ]);
      prisma.accountingTaxTypeMatchSuggestion.groupBy.mockResolvedValue([{ suggestedTaxTypeId: 'tt-1', _count: { _all: 2 } }]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].status).toBe('CONFLICT');
    });

    it('surfaces changeDetectedAt/changeAcknowledgedAt in the formatted row', async () => {
      const detectedAt = new Date('2026-02-01');
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([row({ changeDetectedAt: detectedAt })]);
      const result = await service.listTaxTypes('dist-1', {});
      expect(result.data[0].changeDetectedAt).toBe(detectedAt);
      expect(result.data[0].changeAcknowledgedAt).toBeNull();
    });
  });

  describe('countNeedsAttention', () => {
    it('returns 0 when there is no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      const count = await service.countNeedsAttention('dist-1');
      expect(count).toBe(0);
    });

    it('sums suggested and ready-to-import counts', async () => {
      prisma.externalAccountingTaxType.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
      const count = await service.countNeedsAttention('dist-1');
      expect(count).toBe(5);
    });
  });

  describe('requestManualSync', () => {
    it('writes an AccountingTaxTypeSyncRequested outbox event scoped to the connection', async () => {
      await service.requestManualSync('dist-1');
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        'AccountingConnection',
        activeConnection.id,
        'AccountingTaxTypeSyncRequested',
        {},
      );
    });
  });

  describe('importAsNewTaxType', () => {
    it('throws NotFoundException when the external tax type does not exist on this connection', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(null);
      await expect(
        service.importAsNewTaxType('dist-1', 'user-1', 'ext-missing', { classification: 'STANDARD' as any }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the external tax type is already mapped', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      prisma.taxTypeAccountingMapping.findFirst.mockResolvedValueOnce({ id: 'existing-mapping' });
      await expect(
        service.importAsNewTaxType('dist-1', 'user-1', 'ext-1', { classification: 'STANDARD' as any }),
      ).rejects.toThrow(ConflictException);
      expect(taxTypes.create).not.toHaveBeenCalled();
    });

    it('creates the tax type using the cache row as a fallback for name/rate, then maps it', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      await service.importAsNewTaxType('dist-1', 'user-1', 'ext-1', { classification: 'STANDARD' as any });

      expect(taxTypes.create).toHaveBeenCalledWith('dist-1', {
        name: 'Standard rate',
        classification: 'STANDARD',
        ratePercentage: '20.00',
      });
      expect(prisma.taxTypeAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          taxTypeId: 'tt-new',
          externalTaxTypeId: 'ext-1',
          matchMethod: AccountingTaxTypeMatchMethod.MANUAL,
          linkedByUserId: 'user-1',
        }),
      });
    });

    it('prefers admin-supplied name and rate over the cache row when provided', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      await service.importAsNewTaxType('dist-1', 'user-1', 'ext-1', {
        name: 'My Custom Name',
        classification: 'STANDARD' as any,
        ratePercentage: '19.50',
      });

      expect(taxTypes.create).toHaveBeenCalledWith('dist-1', {
        name: 'My Custom Name',
        classification: 'STANDARD',
        ratePercentage: '19.50',
      });
    });
  });

  describe('confirmSuggestion', () => {
    it('throws NotFoundException when the suggestion does not exist or is already resolved', async () => {
      prisma.accountingTaxTypeMatchSuggestion.findFirst.mockResolvedValue(null);
      await expect(service.confirmSuggestion('dist-1', 'user-1', 'sug-missing')).rejects.toThrow(NotFoundException);
    });

    it('creates the mapping and marks the suggestion ACCEPTED', async () => {
      prisma.accountingTaxTypeMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sug-1',
        externalTaxTypeId: 'ext-1',
        suggestedTaxTypeId: 'tt-1',
        matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
      });
      await service.confirmSuggestion('dist-1', 'user-1', 'sug-1');

      expect(prisma.taxTypeAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ taxTypeId: 'tt-1', externalTaxTypeId: 'ext-1', linkedByUserId: 'user-1' }),
      });
      expect(prisma.accountingTaxTypeMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({ status: AccountingTaxTypeMatchStatus.ACCEPTED, reviewedByUserId: 'user-1' }),
      });
    });
  });

  describe('matchToExistingTaxType', () => {
    it('throws NotFoundException when the target Wholo tax type does not belong to this distributor', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      prisma.taxType.findFirst.mockResolvedValue(null);
      await expect(service.matchToExistingTaxType('dist-1', 'user-1', 'ext-1', 'tt-other-dist')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the Wholo tax type already has an active mapping', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      prisma.taxType.findFirst.mockResolvedValue({ id: 'tt-1', distributorId: 'dist-1' });
      prisma.taxTypeAccountingMapping.findFirst.mockResolvedValueOnce({ id: 'existing' });
      await expect(service.matchToExistingTaxType('dist-1', 'user-1', 'ext-1', 'tt-1')).rejects.toThrow(ConflictException);
    });

    it('creates the mapping and supersedes any pending suggestion for the external row', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      prisma.taxType.findFirst.mockResolvedValue({ id: 'tt-1', distributorId: 'dist-1' });
      await service.matchToExistingTaxType('dist-1', 'user-1', 'ext-1', 'tt-1');

      expect(prisma.taxTypeAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ taxTypeId: 'tt-1', externalTaxTypeId: 'ext-1', matchMethod: AccountingTaxTypeMatchMethod.MANUAL }),
      });
      expect(prisma.accountingTaxTypeMatchSuggestion.updateMany).toHaveBeenCalledWith({
        where: { externalTaxTypeId: 'ext-1', status: AccountingTaxTypeMatchStatus.SUGGESTED },
        data: { status: AccountingTaxTypeMatchStatus.SUPERSEDED },
      });
    });
  });

  describe('ignore', () => {
    it('sets ignoredAt and rejects any pending suggestion', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      await service.ignore('dist-1', 'user-1', 'ext-1');

      expect(prisma.externalAccountingTaxType.update).toHaveBeenCalledWith({
        where: { id: 'ext-1' },
        data: { ignoredAt: expect.any(Date) },
      });
      expect(prisma.accountingTaxTypeMatchSuggestion.updateMany).toHaveBeenCalledWith({
        where: { externalTaxTypeId: 'ext-1', status: AccountingTaxTypeMatchStatus.SUGGESTED },
        data: expect.objectContaining({ status: AccountingTaxTypeMatchStatus.REJECTED, reviewedByUserId: 'user-1' }),
      });
    });
  });

  describe('unlink', () => {
    it('throws NotFoundException when the mapping does not exist or is already unlinked', async () => {
      prisma.taxTypeAccountingMapping.findFirst.mockResolvedValue(null);
      await expect(service.unlink('dist-1', 'map-missing')).rejects.toThrow(NotFoundException);
    });

    it('sets unlinkedAt on the mapping', async () => {
      prisma.taxTypeAccountingMapping.findFirst.mockResolvedValue({ id: 'map-1', unlinkedAt: null });
      await service.unlink('dist-1', 'map-1');
      expect(prisma.taxTypeAccountingMapping.update).toHaveBeenCalledWith({
        where: { id: 'map-1' },
        data: { unlinkedAt: expect.any(Date) },
      });
    });
  });

  describe('acknowledgeChange', () => {
    it('sets changeAcknowledgedAt on the cache row without touching the rate', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(row());
      await service.acknowledgeChange('dist-1', 'ext-1');

      expect(prisma.externalAccountingTaxType.update).toHaveBeenCalledWith({
        where: { id: 'ext-1' },
        data: { changeAcknowledgedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException when the external tax type does not exist on this connection', async () => {
      prisma.externalAccountingTaxType.findFirst.mockResolvedValue(null);
      await expect(service.acknowledgeChange('dist-1', 'ext-missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveTaxTypeForCode', () => {
    it('returns null without querying when the code is null', async () => {
      const result = await service.resolveTaxTypeForCode('conn-1', null);
      expect(result).toBeNull();
      expect(prisma.externalAccountingTaxType.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when the code has not been synced as a tax rate on this connection', async () => {
      prisma.externalAccountingTaxType.findUnique.mockResolvedValue(null);
      const result = await service.resolveTaxTypeForCode('conn-1', 'OUTPUT2');
      expect(result).toBeNull();
      expect(prisma.externalAccountingTaxType.findUnique).toHaveBeenCalledWith({
        where: { accountingConnectionId_taxType: { accountingConnectionId: 'conn-1', taxType: 'OUTPUT2' } },
        include: expect.objectContaining({ mappings: expect.anything() }),
      });
    });

    it('returns null when the tax rate is synced but has no confirmed mapping', async () => {
      prisma.externalAccountingTaxType.findUnique.mockResolvedValue({ id: 'ext-1', mappings: [] });
      const result = await service.resolveTaxTypeForCode('conn-1', 'OUTPUT2');
      expect(result).toBeNull();
    });

    it('returns the mapped tax type id and name when a confirmed mapping exists', async () => {
      prisma.externalAccountingTaxType.findUnique.mockResolvedValue({
        id: 'ext-1',
        mappings: [{ taxType: { id: 'tt-1', name: 'VAT' } }],
      });
      const result = await service.resolveTaxTypeForCode('conn-1', 'OUTPUT2');
      expect(result).toEqual({ taxTypeId: 'tt-1', taxTypeName: 'VAT' });
    });
  });
});
