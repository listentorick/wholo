import { Body, Controller, ForbiddenException, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalService } from './portal.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ActingCustomerId } from '../order-as/acting-customer.decorator';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organisations/:organisationId')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('distributors')
  @ApiOperation({ summary: 'List distributors the organisation has access to' })
  @ApiOkResponse({ description: 'List of accessible distributors with contact info and order count' })
  getMyDistributors(
    @Param('organisationId') organisationId: string,
    @ActingCustomerId() actingCustomerId: string,
  ) {
    if (organisationId !== actingCustomerId) {
      throw new ForbiddenException('Not authorised for this organisation');
    }
    return this.portalService.getMyDistributors(organisationId);
  }

  @Get('recommended-distributors')
  @ApiOperation({ summary: 'Marketplace-visible distributors the organisation is not yet connected to' })
  @ApiOkResponse({
    description: 'Up to 24 distributor orgs, name-ordered, excluding any existing trade relationship',
  })
  getRecommendedDistributors(
    @Param('organisationId') organisationId: string,
    @ActingCustomerId() actingCustomerId: string,
  ) {
    if (organisationId !== actingCustomerId) {
      throw new ForbiddenException('Not authorised for this organisation');
    }
    return this.portalService.getRecommendedDistributors(organisationId);
  }

  @Get()
  @ApiOperation({ summary: 'Get the organisation profile' })
  getMyProfile(@Param('organisationId') organisationId: string, @Req() req: RequestWithUser) {
    if (organisationId !== req.user.organisationId) {
      throw new ForbiddenException('Not authorised for this organisation');
    }
    return this.portalService.getMyProfile(organisationId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the organisation profile' })
  updateMyProfile(
    @Param('organisationId') organisationId: string,
    @Req() req: RequestWithUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    if (organisationId !== req.user.organisationId) {
      throw new ForbiddenException('Not authorised for this organisation');
    }
    return this.portalService.updateMyProfile(organisationId, dto);
  }
}
