import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AdminProductTypesService } from './admin-product-types.service';

@ApiTags('Admin / Products')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminProductTypesController {
  constructor(private service: AdminProductTypesService) {}

  @Get('product-types')
  @ApiOperation({ summary: 'List product types for a distributor' })
  @ApiOkResponse({ description: 'List of product types' })
  findAll(@Headers('x-distributor-id') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
