import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me/distributors')
  getMyDistributors(@Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.portalService.getMyDistributors(token);
  }

  @Get('me/profile')
  getMyProfile(@Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.portalService.getMyProfile(token);
  }

  @Patch('me/profile')
  updateMyProfile(@Req() req: Request, @Body() body: unknown) {
    const { token } = req['user'] as { token: string };
    return this.portalService.updateMyProfile(token, body);
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
