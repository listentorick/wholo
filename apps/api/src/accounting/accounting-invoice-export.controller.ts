import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AccountingInvoiceExportService } from './accounting-invoice-export.service';

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/accounting/invoice-exports')
export class AccountingInvoiceExportController {
  constructor(private readonly service: AccountingInvoiceExportService) {}

  @Post(':exportId/retry')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue a retry of a failed accounting invoice export' })
  retry(@Param('distributorId') distributorId: string, @Param('exportId') exportId: string) {
    return this.service.retryExport(distributorId, exportId);
  }
}
