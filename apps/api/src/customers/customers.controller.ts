import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ORDER_AS_CONTEXT_KEY, OrderAsContext } from '../order-as/order-as.interceptor';
import { CustomersService } from './customers.service';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

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
    @Req() req: RequestWithUser,
  ) {
    // The path id is a claim — it must match the auth-resolved customer.
    // Distributor-side principals (staff, distributor-scoped client credentials)
    // plug into this check when they gain a caller.
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const authCustomerId = orderAs?.customerId ?? req.user.organisationId;
    if (customerId !== authCustomerId) throw new ForbiddenException();
    return this.service.getSelfView(distributorId, customerId);
  }
}
