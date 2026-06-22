import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Request } from 'express';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class AcceptInviteBody {
  @IsString()
  token: string;
}

@Controller('invitations')
export class InvitationsController {
  constructor(private service: InvitationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('accept')
  accept(@Body() body: AcceptInviteBody, @Req() req: Request) {
    const { token: accessToken } = req['user'] as { token: string };
    return this.service.accept(body.token, accessToken);
  }
}
