import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminProductTypesService } from './admin-product-types.service';

@ApiTags('Admin / Products')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId')
export class AdminProductTypesController {
  constructor(private service: AdminProductTypesService) {}

  @Get('product-types')
  @ApiOperation({ summary: 'List product types for a distributor' })
  @ApiOkResponse({ description: 'List of product types' })
  findAll(@Param('distributorId') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
