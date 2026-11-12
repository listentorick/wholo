import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import { PortalInvitationsService } from './portal-invitations.service';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { Throttle } from '@nestjs/throttler';
import { INVITATION_LOOKUP_LIMIT, InvitationLookupThrottlerGuard } from '../invitation-codes/invitation-lookup-throttler.guard';

class InvitationTokenDto {
  @IsString()
  @MaxLength(256)
  token: string;
}

class AcceptInviteDto extends InvitationTokenDto {
  /** The code emailed to the invited address, when signed in with another address (ADR-081). */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

// The token is in the body, never the path, so it stays out of access logs.
@Controller('portal/invitations')
export class PortalInvitationsController {
  constructor(private service: PortalInvitationsService) {}

  // No sign-in: the invitee has no account yet. Rate-limited per token.
  @UseGuards(InvitationLookupThrottlerGuard)
  @Throttle(INVITATION_LOOKUP_LIMIT)
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(@Body() body: InvitationTokenDto) {
    return this.service.lookup(body.token);
  }

  @UseGuards(KeycloakIdentityGuard)
  @Post('email-code')
  @HttpCode(HttpStatus.OK)
  sendCode(@Request() req: { user: KeycloakIdentity }, @Body() body: InvitationTokenDto) {
    return this.service.sendCode(req.user, body.token);
  }

  @UseGuards(KeycloakIdentityGuard)
  @Post('accept')
  accept(@Request() req: { user: KeycloakIdentity }, @Body() body: AcceptInviteDto) {
    return this.service.acceptInvite(req.user, body.token, body.code);
  }
}
