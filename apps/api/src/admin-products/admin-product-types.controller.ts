import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AdminProductTypesService } from './admin-product-types.service';

@ApiTags('Admin / Products')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.CATALOGUE_MANAGE)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId')
export class AdminProductTypesController {
  constructor(private service: AdminProductTypesService) {}

  @Get('product-types')
  @ApiOperation({ summary: 'List product types for a distributor' })
  @ApiOkResponse({ description: 'List of product types' })
  findAll(@Param('distributorId') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
