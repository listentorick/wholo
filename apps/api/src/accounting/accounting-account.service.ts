import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from './accounting-connection.service';
import { organisationScope } from './accounting-organisation';

// The sales accounts cached from the distributor's accounting system by
// AccountingAccountSyncProcessor (ADR-079), for choosing the default sales
// account. Reads the cache only — never the provider.
@Injectable()
export class AccountingAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: AccountingConnectionService,
  ) {}

  // Active accounts of the organisation the live connection points at,
  // ordered by code.
  async listSalesAccounts(distributorId: string) {
    const connection = await this.connections.getActiveConnectionOrThrow(distributorId);
    return this.prisma.externalAccountingAccount.findMany({
      where: { ...organisationScope(connection), isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true },
    });
  }
}
