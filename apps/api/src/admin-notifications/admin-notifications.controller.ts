import { Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAccessGuard } from '../auth/guards/user-access.guard';
import { AdminNotificationsService } from './admin-notifications.service';

interface AuthenticatedRequest {
  user?: { organisationId?: string };
}

// Resource-oriented, explicit-id shape (CLAUDE.md): no "me" alias here — the
// BFF adapts JWT identity into this explicit :userId, and UserAccessGuard
// re-verifies it server-side against the token's own sub.
@ApiTags('Admin Notifications')
@ApiBearerAuth()
@ApiParam({ name: 'userId', description: 'User ID — must match the authenticated credential' })
@UseGuards(JwtAuthGuard, UserAccessGuard)
@Controller('users/:userId/notifications')
export class AdminNotificationsController {
  constructor(private readonly service: AdminNotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List a user's recent in-app notifications, newest first" })
  list(@Param('userId') userId: string, @Query('limit') limit: string | undefined, @Req() req: AuthenticatedRequest) {
    return this.service.list(userId, this.organisationId(req), limit ? Number(limit) : undefined);
  }

  @Get('unread-count')
  @ApiOperation({ summary: "Count of a user's unread notifications" })
  async unreadCount(@Param('userId') userId: string, @Req() req: AuthenticatedRequest) {
    return { count: await this.service.unreadCount(userId, this.organisationId(req)) };
  }

  @Post(':notificationId/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(
    @Param('userId') userId: string,
    @Param('notificationId') notificationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.markRead(userId, this.organisationId(req), notificationId);
  }

  @Post('read-all')
  @ApiOperation({ summary: "Mark all of a user's notifications as read" })
  markAllRead(@Param('userId') userId: string, @Req() req: AuthenticatedRequest) {
    return this.service.markAllRead(userId, this.organisationId(req));
  }

  // organisationId comes from the JWT-derived principal (JwtStrategy resolves
  // it via a Membership lookup), never from a client-supplied param — a path
  // id is a claim, the credential is authority (CLAUDE.md).
  private organisationId(req: AuthenticatedRequest): string {
    const organisationId = req.user?.organisationId;
    if (!organisationId) throw new ForbiddenException('No organisation on the authenticated credential');
    return organisationId;
  }
}
