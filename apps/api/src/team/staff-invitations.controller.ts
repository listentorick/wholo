import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateStaffInvitationDto, UpdateStaffRolesDto } from './dto/staff-roles.dto';
import { StaffInvitationsService } from './staff-invitations.service';

interface RequestWithUser extends Request {
  user: { sub: string };
}

@ApiTags('Team / Staff invitations')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@RequirePermissions(Permission.TEAM_MANAGE)
@Controller('distributors/:distributorId/staff-invitations')
export class StaffInvitationsController {
  constructor(private readonly service: StaffInvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'List pending and expired staff invitations' })
  @ApiOkResponse({ description: 'Invitations, newest first' })
  list(@Param('distributorId') distributorId: string) {
    return this.service.list(distributorId);
  }

  @Post()
  @ApiOperation({ summary: 'Invite an employee' })
  @ApiCreatedResponse({ description: 'Invitation created and the email queued' })
  @ApiConflictResponse({ description: 'The email already has a Stocdup account' })
  create(
    @Param('distributorId') distributorId: string,
    @Body() dto: CreateStaffInvitationDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.create(distributorId, req.user.sub, dto);
  }

  @Patch(':invitationId')
  @ApiOperation({ summary: 'Change the roles on a pending invitation' })
  @ApiOkResponse({ description: 'Updated invitation' })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  @ApiConflictResponse({ description: 'Invitation has expired' })
  updateRoles(
    @Param('distributorId') distributorId: string,
    @Param('invitationId') invitationId: string,
    @Body() dto: UpdateStaffRolesDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateRoles(distributorId, invitationId, req.user.sub, dto);
  }

  @Post(':invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend an invitation with a fresh link and expiry' })
  @ApiOkResponse({ description: 'The new invitation (the earlier link stops working)' })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  resend(
    @Param('distributorId') distributorId: string,
    @Param('invitationId') invitationId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.resend(distributorId, invitationId, req.user.sub);
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an invitation' })
  @ApiNoContentResponse({ description: 'Invitation revoked' })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  revoke(
    @Param('distributorId') distributorId: string,
    @Param('invitationId') invitationId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.revoke(distributorId, invitationId, req.user.sub);
  }
}
