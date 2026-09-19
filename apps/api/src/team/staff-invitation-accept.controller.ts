import { Body, Controller, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiGoneResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags,
} from '@nestjs/swagger';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { AcceptStaffInvitationDto } from './dto/accept-staff-invitation.dto';
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
  @ApiForbiddenResponse({ description: 'Sent to a different email address' })
  accept(@Request() req: { user: KeycloakIdentity }, @Body() body: AcceptStaffInvitationDto) {
    return this.service.accept(req.user, body.token);
  }
}
