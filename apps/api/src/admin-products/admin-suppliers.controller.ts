import { Controller, Get, Headers } from '@nestjs/common';
import { AdminSuppliersService } from './admin-suppliers.service';

@Controller('admin')
export class AdminSuppliersController {
  constructor(private service: AdminSuppliersService) {}

  @Get('suppliers')
  findAll(@Headers('x-distributor-id') distributorId: string) {
    return this.service.findAll(distributorId);
  }
}
