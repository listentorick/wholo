import { Body, Controller, Delete, Get, Param, ParseBoolPipe, Post, Query, Req, UseGuards, DefaultValuePipe } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiParam, ApiQuery, ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PlatformAccessGuard } from '../auth/guards/platform-access.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RequestUser } from '../auth/ops-session';
import { CreateSupportGrantDto } from './dto/create-support-grant.dto';
import { SupportGrantsService } from './support-grants.service';

interface RequestWithUser extends Request {
  user: RequestUser;
}

/** A distributor's support grants (ADR-078). */
@ApiTags('Support access')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@Controller('distributors/:distributorId/support-grants')
export class SupportGrantsController {
  constructor(private readonly service: SupportGrantsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PlatformAccessGuard)
  @RequirePermissions(Permission.SUPPORT_GRANTS_SELF_CREATE)
  @ApiOperation({ summary: 'Open time-limited Stocdup support access to this distributor, for yourself (Ops app only)' })
  @ApiCreatedResponse({ description: 'The new (or extended) grant' })
  @ApiForbiddenResponse({ description: 'Not a platform admin in an Ops session, or userId is not the caller' })
  @ApiNotFoundResponse({ description: 'Distributor not found' })
  @ApiConflictResponse({ description: 'The caller is already a member of this distributor' })
  create(@Param('distributorId') distributorId: string, @Body() dto: CreateSupportGrantDto, @Req() req: RequestWithUser) {
    return this.service.create(req.user, distributorId, dto);
  }

  // DistributorAccessGuard admits the caller's organisations; the service then
  // insists on an OWN membership, so a support visitor cannot list grants.
  @Get()
  @UseGuards(JwtAuthGuard, DistributorAccessGuard)
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'Only grants in effect now (any member); otherwise full history (team managers)' })
  @ApiOperation({ summary: 'Stocdup support access to this distributor' })
  @ApiOkResponse({ description: 'Grants, active first' })
  list(
    @Param('distributorId') distributorId: string,
    @Query('active', new DefaultValuePipe(false), ParseBoolPipe) active: boolean,
    @Req() req: RequestWithUser,
  ) {
    return this.service.listForDistributor(req.user, distributorId, active);
  }

  @Delete(':grantId')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'grantId', description: 'Support grant ID' })
  @ApiOperation({ summary: 'End Stocdup support access now' })
  @ApiOkResponse({ description: 'The ended grant' })
  @ApiForbiddenResponse({ description: 'Not the holder, a team manager here, or a platform admin' })
  @ApiNotFoundResponse({ description: 'Grant not found on this distributor' })
  revoke(@Param('distributorId') distributorId: string, @Param('grantId') grantId: string, @Req() req: RequestWithUser) {
    return this.service.revoke(req.user, distributorId, grantId);
  }
}

/** An operator's own support grants (ADR-078). */
@ApiTags('Support access')
@ApiBearerAuth()
@ApiParam({ name: 'userId', description: 'User ID — must be the caller' })
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
@RequirePermissions(Permission.SUPPORT_GRANTS_SELF_CREATE)
@Controller('users/:userId/support-grants')
export class UserSupportGrantsController {
  constructor(private readonly service: SupportGrantsService) {}

  @Get()
  @ApiOperation({ summary: 'Your support access: open now, then recent (Ops app only)' })
  @ApiOkResponse({ description: 'Grants, active first' })
  list(@Param('userId') userId: string, @Req() req: RequestWithUser) {
    return this.service.listForUser(req.user, userId);
  }
}
