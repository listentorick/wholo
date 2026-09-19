import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { UpdateStaffRolesDto } from './dto/staff-roles.dto';
import { TeamMembersService } from './team-members.service';

interface RequestWithUser extends Request {
  user: { sub: string };
}

@ApiTags('Team / Members')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@RequirePermissions(Permission.TEAM_MANAGE)
@Controller('distributors/:distributorId/members')
export class TeamMembersController {
  constructor(private readonly service: TeamMembersService) {}

  @Get()
  @ApiOperation({ summary: 'List the distributor’s team members' })
  @ApiOkResponse({ description: 'Members with their roles' })
  list(@Param('distributorId') distributorId: string) {
    return this.service.list(distributorId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Replace a team member’s roles' })
  @ApiOkResponse({ description: 'Updated member' })
  @ApiNotFoundResponse({ description: 'Team member not found' })
  @ApiForbiddenResponse({ description: 'Target is the Owner or the caller' })
  updateRoles(
    @Param('distributorId') distributorId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffRolesDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateRoles(distributorId, userId, req.user.sub, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a team member — they lose access and can no longer sign in' })
  @ApiNoContentResponse({ description: 'Removed; history is retained' })
  @ApiNotFoundResponse({ description: 'Team member not found' })
  @ApiForbiddenResponse({ description: 'Target is the Owner or the caller' })
  remove(
    @Param('distributorId') distributorId: string,
    @Param('userId') userId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.remove(distributorId, userId, req.user.sub);
  }
}
