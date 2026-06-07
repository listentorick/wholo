import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async login(user: Awaited<ReturnType<UsersService['validateCredentials']>>) {
    if (!user) throw new Error('User is required');
    const membership = user.memberships[0];

    const payload = {
      sub: user.id,
      email: user.email,
      role: membership?.role,
      organisationId: membership?.organisationId,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresDays = parseInt(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS', '30'), 10);
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: membership?.role,
        organisationId: membership?.organisationId,
        organisationName: membership?.organisation?.name,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    const membership = user.memberships[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership?.role,
      organisationId: membership?.organisationId,
      organisationName: membership?.organisation?.name,
    };
  }
}
