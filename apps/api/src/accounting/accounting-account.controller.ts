import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AccountingAccountService } from './accounting-account.service';

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/accounting/accounts')
export class AccountingAccountController {
  constructor(private readonly service: AccountingAccountService) {}

  @Get()
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'List the cached sales accounts, for choosing the default sales account' })
  listSalesAccounts(@Param('distributorId') distributorId: string) {
    return this.service.listSalesAccounts(distributorId);
  }
}
