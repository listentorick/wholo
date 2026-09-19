import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';
import type { KeycloakPrincipal } from '../auth/strategies/keycloak-jwt.strategy';
import { AcceptInvitationDto } from './dto/team.dto';
import { TeamService } from './team.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private teamService: TeamService) {}

  // Signature-only guard: an invited employee has no membership (and so no
  // distributor) until this call succeeds — same reason as /onboarding/distributor.
  // Email verification and the invited-address binding are enforced by apps/api.
  @UseGuards(KeycloakJwtAuthGuard)
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: Request & { user: KeycloakPrincipal }, @Body() dto: AcceptInvitationDto) {
    return this.teamService.acceptInvitation(dto.token, req.user.token ?? '');
  }
}
