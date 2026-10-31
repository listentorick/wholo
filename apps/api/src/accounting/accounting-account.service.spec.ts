import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingAccountService } from './accounting-account.service';

const mockPrisma = { externalAccountingAccount: { findMany: jest.fn() } };
const mockConnections = { getActiveConnectionOrThrow: jest.fn() };

describe('AccountingAccountService', () => {
  let service: AccountingAccountService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingConnectionService, useValue: mockConnections },
      ],
    }).compile();
    service = module.get(AccountingAccountService);
  });

  it("lists the active cached accounts of the live connection's organisation, by code", async () => {
    mockConnections.getActiveConnectionOrThrow.mockResolvedValue({ distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1' });
    const accounts = [{ id: 'acct-1', code: '200', displayName: 'Sales' }];
    mockPrisma.externalAccountingAccount.findMany.mockResolvedValue(accounts);

    await expect(service.listSalesAccounts('dist-1')).resolves.toBe(accounts);
    expect(mockPrisma.externalAccountingAccount.findMany).toHaveBeenCalledWith({
      where: { distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1', isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true },
    });
  });

  it('throws NotFoundException when there is no live connection', async () => {
    mockConnections.getActiveConnectionOrThrow.mockRejectedValue(new NotFoundException());
    await expect(service.listSalesAccounts('dist-1')).rejects.toThrow(NotFoundException);
  });
});
