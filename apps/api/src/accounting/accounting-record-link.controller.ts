import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AccountingRecordLinkService } from './accounting-record-link.service';

// A Stocdup record's accounting link, addressed by the record itself
// (resource-oriented — see CLAUDE.md "Primary API layout").
@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId')
export class AccountingRecordLinkController {
  constructor(private readonly service: AccountingRecordLinkService) {}

  @Get('customers/:customerId/accounting')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiParam({ name: 'customerId', description: 'Customer organisation ID' })
  @ApiOperation({ summary: "The customer's link to the accounting system: linked contact, open suggestion, history" })
  getCustomerLink(@Param('distributorId') distributorId: string, @Param('customerId') customerId: string) {
    return this.service.getCustomerLink(distributorId, customerId);
  }

  @Get('products/:productId/accounting')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: "The product's link to the accounting system: linked item, open suggestion, history" })
  getProductLink(@Param('distributorId') distributorId: string, @Param('productId') productId: string) {
    return this.service.getProductLink(distributorId, productId);
  }
}
