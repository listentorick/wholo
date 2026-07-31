import { Controller, ForbiddenException, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActingCustomerId } from '../order-as/acting-customer.decorator';
import { CustomersService } from './customers.service';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('distributors')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get(':distributorId/customers/:customerId')
  @ApiOperation({ summary: "Get a distributor's customer record (base customer + trade information)" })
  async getCustomer(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @ActingCustomerId() authCustomerId: string,
  ) {
    // The path id is a claim — it must match the auth-resolved customer.
    // Distributor-side principals (staff, distributor-scoped client credentials)
    // plug into this check when they gain a caller.
    if (customerId !== authCustomerId) throw new ForbiddenException();
    return this.service.getSelfView(distributorId, customerId);
  }
}
