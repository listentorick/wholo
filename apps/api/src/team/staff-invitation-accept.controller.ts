import { Body, Controller, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiGoneResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags,
} from '@nestjs/swagger';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { Throttle } from '@nestjs/throttler';
import { INVITATION_LOOKUP_LIMIT, InvitationLookupThrottlerGuard } from '../invitation-codes/invitation-lookup-throttler.guard';
import { AcceptStaffInvitationDto, StaffInvitationTokenDto } from './dto/accept-staff-invitation.dto';
import { StaffInvitationAcceptService } from './staff-invitation-accept.service';

// Not under distributors/:distributorId — the invitee only has the emailed
// link (a bearer token), and has no membership yet for the guards to scope by.
// The token IS the claim; it is looked up by hash and bound to the invited email.
@ApiTags('Team / Staff invitations')
@ApiBearerAuth()
@Controller('staff-invitations')
export class StaffInvitationAcceptController {
  constructor(private readonly service: StaffInvitationAcceptService) {}

  @UseGuards(KeycloakIdentityGuard)
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a staff invitation as the signed-in, email-verified user' })
  @ApiOkResponse({ description: 'Joined the team — returns the company and roles' })
  @ApiNotFoundResponse({ description: 'Unknown invitation' })
  @ApiConflictResponse({ description: 'Already accepted, or the account already belongs to a company' })
  @ApiGoneResponse({ description: 'Expired or revoked' })
  @ApiForbiddenResponse({ description: 'Sent to a different email address, and no code given' })
  accept(@Request() req: { user: KeycloakIdentity }, @Body() body: AcceptStaffInvitationDto) {
    return this.service.accept(req.user, body.token, body.code);
  }

  // No sign-in: the invitee may have no account yet. Rate-limited per token.
  @UseGuards(InvitationLookupThrottlerGuard)
  @Throttle(INVITATION_LOOKUP_LIMIT)
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The invited address and who sent the invitation, for the accept page (ADR-081)' })
  @ApiNotFoundResponse({ description: 'Unknown invitation' })
  @ApiGoneResponse({ description: 'Expired or revoked' })
  lookup(@Body() body: StaffInvitationTokenDto) {
    return this.service.lookup(body.token);
  }

  @UseGuards(KeycloakIdentityGuard)
  @Post('email-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a one-time code to the invited address, for a login with another address (ADR-081)' })
  sendCode(@Request() req: { user: KeycloakIdentity }, @Body() body: StaffInvitationTokenDto) {
    return this.service.sendCode(req.user, body.token);
  }
}
