import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AdminSuppliersService } from './admin-suppliers.service';

@ApiTags('Admin / Suppliers')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.SUPPLIERS_MANAGE)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId')
export class AdminSuppliersController {
  constructor(private service: AdminSuppliersService) {}

  @Get('suppliers')
  @ApiOperation({ summary: 'List suppliers for a distributor' })
  @ApiOkResponse({ description: 'List of suppliers' })
  findAll(@Param('distributorId') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
