import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CustomerHealthService } from './customer-health.service';

@ApiTags('Customer Health')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.ANALYTICS_READ)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/customer-health')
export class CustomerHealthController {
  constructor(private readonly service: CustomerHealthService) {}

  @Get()
  @ApiOperation({ summary: 'Customer health tiers, flagged reasons and buying trends for at-risk-customer detection' })
  @ApiOkResponse({ description: 'Stat tiles, tier counts, needing-attention list and buying-trends series' })
  getHealth(@Param('distributorId') distributorId: string) {
    return this.service.getHealth(distributorId);
  }
}
