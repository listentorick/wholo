import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CustomerOrderingService } from './customer-ordering.service';

// How a customer orders from this distributor, addressed explicitly by both
// ids (the customer is the organisation id, same as /customers/:id). Sales
// figures, so analytics:read like the other dashboards' reads. The guards
// enforce that the caller may act for distributorId; the service scopes every
// query by it.
@ApiTags('Customer Ordering')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@ApiParam({ name: 'customerId', description: 'Customer organisation ID' })
@RequirePermissions(Permission.ANALYTICS_READ)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/customers/:customerId/ordering-behaviour')
export class CustomerOrderingController {
  constructor(private readonly service: CustomerOrderingService) {}

  @Get()
  @ApiOperation({ summary: "Customer's recency, order frequency, spend and distinct products over the last 30 days, with the trend" })
  @ApiOkResponse({ description: 'CustomerOrderingBehaviour' })
  getBehaviour(@Param('distributorId') distributorId: string, @Param('customerId') customerId: string) {
    return this.service.getBehaviour(distributorId, customerId);
  }
}
