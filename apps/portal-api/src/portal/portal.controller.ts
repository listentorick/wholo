import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: { token: string; organisationId: string };
}

@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me/distributors')
  getMyDistributors(@Req() req: RequestWithUser) {
    const { token, organisationId } = req.user;
    return this.portalService.getMyDistributors(organisationId, token);
  }

  @Get('me/recommended-distributors')
  getRecommendedDistributors(@Req() req: RequestWithUser) {
    const { token, organisationId } = req.user;
    return this.portalService.getRecommendedDistributors(organisationId, token);
  }

  @Get('me/profile')
  getMyProfile(@Req() req: RequestWithUser) {
    const { token, organisationId } = req.user;
    return this.portalService.getMyProfile(organisationId, token);
  }

  @Patch('me/profile')
  updateMyProfile(@Req() req: RequestWithUser, @Body() body: unknown) {
    const { token, organisationId } = req.user;
    return this.portalService.updateMyProfile(organisationId, token, body);
  }

  @Get('me/delivery-address')
  getMyDeliveryAddress(
    @Req() req: Request,
    @Query('distributorSlug') distributorSlug: string,
    @Query('customerId') customerId: string,
  ) {
    const { token } = req['user'] as { token: string };
    return this.portalService.getMyDeliveryAddress(token, distributorSlug, customerId);
  }

  @Get('me/distributors/:slug/relationship')
  getDistributorRelationship(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Query('customerId') customerId: string,
  ) {
    const { token } = req['user'] as { token: string };
    return this.portalService.getDistributorRelationship(token, slug, customerId);
  }

  @Post('me/distributors/:slug/relationship')
  requestDistributorAccess(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Query('customerId') customerId: string,
    @Body() body: { recentContact: boolean },
  ) {
    const { token } = req['user'] as { token: string };
    return this.portalService.requestDistributorAccess(token, slug, customerId, body.recentContact);
  }
}
