import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalService } from './portal.service';

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
}
