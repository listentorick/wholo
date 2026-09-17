import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActingCustomerId } from '../order-as/acting-customer.decorator';
import { CustomersService } from './customers.service';
import { RequestAccessDto } from './dto/request-access.dto';

interface RequestWithUser extends Request {
  user: { organisationId: string; organisationIds?: string[] };
}

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('distributors')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get(':distributorId/customers/:customerId')
  @ApiOperation({
    summary:
      "Get a distributor's customer record (base customer + trade information) — full detail for " +
      'distributor staff, or a self-view for the customer themselves',
  })
  async getCustomer(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @ActingCustomerId() authCustomerId: string,
    @Req() req: RequestWithUser,
  ) {
    // The path id is a claim — it must be either the auth-resolved customer's
    // own id, or the caller must be staff of this distributor (mirrors
    // DistributorAccessGuard's membership check).
    const isSelf = customerId === authCustomerId;
    const isDistributorStaff = req.user.organisationIds?.includes(distributorId) ?? false;
    if (!isSelf && !isDistributorStaff) throw new ForbiddenException();
    return this.service.getCustomer(distributorId, customerId);
  }

  @Post(':distributorId/customers/:customerId')
  @ApiOperation({ summary: 'Request access to a distributor as a trade customer' })
  async requestAccess(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @Body() dto: RequestAccessDto,
    @ActingCustomerId() authCustomerId: string,
  ) {
    if (customerId !== authCustomerId) throw new ForbiddenException();
    return this.service.requestAccess(distributorId, customerId, dto.recentContact);
  }
}
