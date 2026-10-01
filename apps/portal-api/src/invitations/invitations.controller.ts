import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Request } from 'express';
import { InvitationsService } from './invitations.service';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';

class AcceptInviteBody {
  @IsString()
  token: string;
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
    return this.service.accept(body.token, accessToken);
  }
}
