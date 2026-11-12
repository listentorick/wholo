import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { InvitationsService } from './invitations.service';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';

class InvitationTokenBody {
  @IsString()
  @MaxLength(256)
  token: string;
}

class AcceptInviteBody extends InvitationTokenBody {
  /** The code emailed to the invited address, when signed in with another address (ADR-081). */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

@Controller('invitations')
export class InvitationsController {
  constructor(private service: InvitationsService) {}

  // Token-only guard, deliberately NOT JwtAuthGuard: a newly invited customer
  // has no Stocdup user until this call succeeds, and JwtAuthGuard rejects
  // identities without one. apps/api validates the token and the invitation.
  @UseGuards(KeycloakJwtAuthGuard)
  @Post('accept')
  accept(@Body() body: AcceptInviteBody, @Req() req: Request) {
    const { token: accessToken } = req['user'] as { token: string };
    return this.service.accept(body.token, accessToken, body.code);
  }

  // No guard: the invitee has no account yet. apps/api rate-limits it per
  // token and returns only the invited address and who sent it (ADR-081).
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(@Body() body: InvitationTokenBody) {
    return this.service.lookup(body.token);
  }

  @UseGuards(KeycloakJwtAuthGuard)
  @Post('email-code')
  @HttpCode(HttpStatus.OK)
  sendCode(@Body() body: InvitationTokenBody, @Req() req: Request) {
    const { token: accessToken } = req['user'] as { token: string };
    return this.service.sendCode(body.token, accessToken);
  }
}
