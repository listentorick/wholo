import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${config.get<string>('KEYCLOAK_URL', 'http://localhost:3080')}/realms/${config.get<string>('KEYCLOAK_REALM', 'wholo')}/protocol/openid-connect/certs`,
      }),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: { sub: string; email?: string }) {
    let user = await this.usersService.findByKeycloakId(payload.sub);

    // JIT link: first login for an existing user created before Keycloak migration
    if (!user && payload.email) {
      user = await this.usersService.linkKeycloakId(payload.email, payload.sub);
    }

    if (!user) throw new UnauthorizedException('No Wholo user found for this identity');
    const membership = user.memberships[0];

    // Union in the legacy scalar `role` alongside MembershipRole rows — a
    // live-rollout safety net so permission resolution is correct even
    // before the one-off db:membership-roles:backfill script has run for a
    // given membership (see MembershipRole in schema.prisma).
    const memberships = user.memberships.map((m) => ({
      organisationId: m.organisationId,
      roles: [...new Set([...m.roles.map((r) => r.role), m.role])],
    }));

    return {
      sub: user.id,
      email: user.email,
      role: membership?.role,
      organisationId: membership?.organisationId,
      organisationIds: user.memberships.map((m) => m.organisationId),
      memberships,
    };
  }
}
