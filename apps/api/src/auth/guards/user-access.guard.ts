import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class UserAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { userId } = request.params;
    const user = request.user as { sub?: string } | undefined;

    if (!user?.sub || user.sub !== userId) {
      throw new ForbiddenException('Not authorized for this user');
    }
    return true;
  }
}
