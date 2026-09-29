import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CustomerPaymentsService } from './customer-payments.service';

// A customer's payment position with this distributor (ADR-072), addressed
// explicitly by both ids (the customer is the organisation id, same as
// /customers/:id). The guards enforce that the caller may act for
// distributorId; the service scopes every query by it.
@ApiTags('Customer Payments')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@ApiParam({ name: 'customerId', description: 'Customer organisation ID' })
@RequirePermissions(Permission.CUSTOMERS_READ)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/customers/:customerId/payments')
export class CustomerPaymentsController {
  constructor(private readonly service: CustomerPaymentsService) {}

  @Get()
  @ApiOperation({ summary: "Customer's outstanding and overdue invoices, and how promptly they have paid (last 90 days)" })
  @ApiOkResponse({ description: 'CustomerPaymentSummary' })
  getSummary(@Param('distributorId') distributorId: string, @Param('customerId') customerId: string) {
    return this.service.getSummary(distributorId, customerId);
  }
}
