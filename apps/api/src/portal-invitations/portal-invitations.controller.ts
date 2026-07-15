import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { IsString } from 'class-validator';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import { PortalInvitationsService } from './portal-invitations.service';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';

class AcceptInviteDto {
  @IsString()
  token: string;
}

@Controller('portal/invitations')
export class PortalInvitationsController {
  constructor(private service: PortalInvitationsService) {}

  @UseGuards(KeycloakIdentityGuard)
  @Post('accept')
  accept(@Request() req: { user: KeycloakIdentity }, @Body() body: AcceptInviteDto) {
    return this.service.acceptInvite(req.user, body.token);
  }
}
