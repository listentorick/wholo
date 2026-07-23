import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

// The "me" adaptation point (CLAUDE.md): apps/api has no identity-relative
// alias, only explicit users/:userId/... routes. Here — the user edge — the
// JWT-derived sub becomes that explicit id; apps/api's UserAccessGuard then
// independently re-verifies it against the token's own sub server-side.
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Query('limit') limit: string | undefined, @Req() req: Request) {
    const { sub: userId, token } = req.user as { sub: string; token: string };
    return this.service.list(userId, limit, token);
  }

  @Get('unread-count')
  unreadCount(@Req() req: Request) {
    const { sub: userId, token } = req.user as { sub: string; token: string };
    return this.service.unreadCount(userId, token);
  }

  @Post(':notificationId/read')
  markRead(@Param('notificationId') notificationId: string, @Req() req: Request) {
    const { sub: userId, token } = req.user as { sub: string; token: string };
    return this.service.markRead(userId, notificationId, token);
  }

  @Post('read-all')
  markAllRead(@Req() req: Request) {
    const { sub: userId, token } = req.user as { sub: string; token: string };
    return this.service.markAllRead(userId, token);
  }
}
