import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AdminSuppliersService } from './admin-suppliers.service';

@ApiTags('Admin / Suppliers')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminSuppliersController {
  constructor(private service: AdminSuppliersService) {}

  @Get('suppliers')
  @ApiOperation({ summary: 'List suppliers for a distributor' })
  @ApiOkResponse({ description: 'List of suppliers' })
  findAll(@Headers('x-distributor-id') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
