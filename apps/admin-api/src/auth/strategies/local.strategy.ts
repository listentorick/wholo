import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { Role } from '@prisma/client';

const ADMIN_ROLES: Role[] = [Role.PLATFORM_ADMIN, Role.DISTRIBUTOR_ADMIN];

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.usersService.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const membership = user.memberships[0];
    if (!membership || !ADMIN_ROLES.includes(membership.role)) {
      throw new UnauthorizedException('Access denied');
    }
    return user;
  }
}
