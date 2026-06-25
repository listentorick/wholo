import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalService } from './portal.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Portal')
@ApiBearerAuth()
@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me/distributors')
  @ApiOperation({ summary: 'List distributors the authenticated trade customer has access to' })
  @ApiOkResponse({ description: 'List of accessible distributors with contact info and order count' })
  getMyDistributors(@Req() req: RequestWithUser) {
    return this.portalService.getMyDistributors(req.user.organisationId);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Get the authenticated trade customer profile' })
  getMyProfile(@Req() req: RequestWithUser) {
    return this.portalService.getMyProfile(req.user.organisationId);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update the authenticated trade customer profile' })
  updateMyProfile(@Req() req: RequestWithUser, @Body() dto: UpdateMyProfileDto) {
    return this.portalService.updateMyProfile(req.user.organisationId, dto);
  }
}
