import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { IsString } from 'class-validator';
import { PortalJwtGuard } from '../auth/guards/portal-jwt.guard';
import { PortalInvitationsService } from './portal-invitations.service';
import type { KeycloakIdentity } from '../auth/strategies/portal-jwt.strategy';

class AcceptInviteDto {
  @IsString()
  token: string;
}

@Controller('api/v1/portal/invitations')
export class PortalInvitationsController {
  constructor(private service: PortalInvitationsService) {}

  @UseGuards(PortalJwtGuard)
  @Post('accept')
  accept(@Request() req: { user: KeycloakIdentity }, @Body() body: AcceptInviteDto) {
    return this.service.acceptInvite(req.user, body.token);
  }
}
