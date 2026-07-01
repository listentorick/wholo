import { Body, Controller, HttpCode, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { OrderAsService } from './order-as.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Order As')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId/order-as')
export class OrderAsAdminController {
  constructor(private readonly orderAsService: OrderAsService) {}

  // Called by apps/admin-api only, relaying the admin's own validated JWT — see
  // DistributorAccessGuard. The delivery token minted here is inert without the
  // admin's Keycloak JWT (enforced on exchange via adminUserId === req.user.sub).
  @Post('sessions')
  @ApiOperation({ summary: 'Create or refresh an order-as session (admin BFF call)' })
  createSession(
    @Param('distributorId') distributorId: string,
    @Body() dto: CreateSessionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.orderAsService.createOrRefreshSession(req.user.sub, distributorId, dto.tradeRelationshipId);
  }
}

@ApiTags('Order As')
@Controller('order-as')
export class OrderAsController {
  private readonly logger = new Logger(OrderAsController.name);
  constructor(private readonly orderAsService: OrderAsService) {}

  @Post('sessions/exchange')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exchange a one-time delivery token for a session token' })
  exchangeToken(@Body() dto: ExchangeTokenDto, @Req() req: RequestWithUser) {
    this.logger.log(`exchange requested sub=${req.user.sub}`);
    return this.orderAsService.exchangeDeliveryToken(dto.deliveryToken, req.user.sub);
  }
}
