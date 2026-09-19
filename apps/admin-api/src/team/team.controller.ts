import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InviteTeamMemberDto, UpdateTeamRolesDto } from './dto/team.dto';
import { TeamService } from './team.service';

@UseGuards(JwtAuthGuard)
@Controller('team')
export class TeamController {
  constructor(private teamService: TeamService) {}

  @Get()
  overview(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.overview(organisationId, token);
  }

  @Post('invitations')
  invite(@Req() req: Request, @Body() dto: InviteTeamMemberDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.invite(organisationId, dto, token);
  }

  @Patch('invitations/:invitationId')
  updateInvitationRoles(@Req() req: Request, @Param('invitationId') invitationId: string, @Body() dto: UpdateTeamRolesDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.updateInvitationRoles(organisationId, invitationId, dto, token);
  }

  @Post('invitations/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  resendInvitation(@Req() req: Request, @Param('invitationId') invitationId: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.resendInvitation(organisationId, invitationId, token);
  }

  @Delete('invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(@Req() req: Request, @Param('invitationId') invitationId: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.revokeInvitation(organisationId, invitationId, token);
  }

  @Patch('members/:userId')
  updateMemberRoles(@Req() req: Request, @Param('userId') userId: string, @Body() dto: UpdateTeamRolesDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.updateMemberRoles(organisationId, userId, dto, token);
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Req() req: Request, @Param('userId') userId: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.teamService.removeMember(organisationId, userId, token);
  }
}
