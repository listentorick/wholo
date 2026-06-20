import { Body, Controller, Headers, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderAsService } from './order-as.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Order As')
@Controller('order-as')
export class OrderAsController {
  private readonly logger = new Logger(OrderAsController.name);
  constructor(private readonly orderAsService: OrderAsService) {}

  // Called by apps/admin-api only — same x-header BFF pattern as all other admin endpoints.
  // The delivery token minted here is inert without the admin's Keycloak JWT (enforced on
  // exchange via adminUserId === req.user.sub). K8s NetworkPolicy should restrict direct
  // access to apps/api from outside the cluster.
  @Post('sessions')
  @ApiHeader({ name: 'x-distributor-id', required: true })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiOperation({ summary: 'Create or refresh an order-as session (admin BFF call)' })
  createSession(
    @Headers('x-distributor-id') distributorId: string,
    @Headers('x-user-id') adminUserId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.orderAsService.createOrRefreshSession(adminUserId, distributorId, dto.tradeRelationshipId);
  }

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
