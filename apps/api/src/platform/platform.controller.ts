import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAccessGuard } from '../auth/guards/platform-access.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RequestUser } from '../auth/ops-session';
import { DistributorFilter, PlatformService } from './platform.service';

interface RequestWithUser extends Request {
  user: RequestUser;
}

/** Cross-tenant views for platform operators (ADR-078). Ops app only. */
@ApiTags('Platform')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Not a platform admin in an Ops session' })
@UseGuards(JwtAuthGuard, PlatformAccessGuard)
@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @Get('distributors')
  @RequirePermissions(Permission.PLATFORM_DISTRIBUTORS_READ)
  @ApiOperation({ summary: 'Every wholesaler, with activity and the caller’s open support access' })
  @ApiQuery({ name: 'q', required: false, description: 'Name, slug or member email' })
  @ApiQuery({ name: 'filter', required: false, enum: ['attention', 'mine'] })
  @ApiOkResponse({ description: 'Wholesalers, by name' })
  listDistributors(@Req() req: RequestWithUser, @Query('q') q?: string, @Query('filter') filter?: string) {
    const f: DistributorFilter | undefined = filter === 'attention' || filter === 'mine' ? filter : undefined;
    return this.service.listDistributors(req.user.sub, { q, filter: f });
  }

  @Get('platform/stats')
  @RequirePermissions(Permission.PLATFORM_STATS_READ)
  @ApiOperation({ summary: 'Platform-wide activity for the Ops dashboard' })
  @ApiOkResponse({ description: 'Counts and orders per day' })
  stats() {
    return this.service.stats();
  }
}
