import { Controller, Get, Headers } from '@nestjs/common';
import { AdminProductTypesService } from './admin-product-types.service';

@Controller('admin')
export class AdminProductTypesController {
  constructor(private service: AdminProductTypesService) {}

  @Get('product-types')
  findAll(@Headers('x-distributor-id') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
