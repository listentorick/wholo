import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAccessGuard } from '../auth/guards/user-access.guard';
import { AdminNotificationsService } from './admin-notifications.service';

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
  list(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.service.list(userId, limit ? Number(limit) : undefined);
  }

  @Get('unread-count')
  @ApiOperation({ summary: "Count of a user's unread notifications" })
  async unreadCount(@Param('userId') userId: string) {
    return { count: await this.service.unreadCount(userId) };
  }

  @Post(':notificationId/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@Param('userId') userId: string, @Param('notificationId') notificationId: string) {
    return this.service.markRead(userId, notificationId);
  }

  @Post('read-all')
  @ApiOperation({ summary: "Mark all of a user's notifications as read" })
  markAllRead(@Param('userId') userId: string) {
    return this.service.markAllRead(userId);
  }
}
