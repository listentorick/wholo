import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { UsersService } from '../../users/users.service';
import { SupportAccessReader } from '../support-access-reader.service';
import { DEFAULT_OPS_CLIENT_ID, MembershipClaim, isOpsSession } from '../ops-session';
import { defaultMembership } from '../default-membership';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly opsClientId: string;

  constructor(
    config: ConfigService,
    private usersService: UsersService,
    private supportAccess: SupportAccessReader,
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
    this.opsClientId = config.get<string>('OPS_KEYCLOAK_CLIENT_ID', DEFAULT_OPS_CLIENT_ID);
  }

  async validate(payload: { sub: string; email?: string; azp?: unknown; acr?: unknown }) {
    let user = await this.usersService.findByKeycloakId(payload.sub);

    // JIT link: first login for an existing user created before Keycloak migration
    if (!user && payload.email) {
      user = await this.usersService.linkKeycloakId(payload.email, payload.sub);
    }

    if (!user) throw new UnauthorizedException('No Wholo user found for this identity');
    const membership = defaultMembership(user.memberships);

    // Union in the legacy scalar `role` alongside MembershipRole rows — a
    // live-rollout safety net so permission resolution is correct even
    // before the one-off db:membership-roles:backfill script has run for a
    // given membership (see MembershipRole in schema.prisma).
    const memberships: MembershipClaim[] = user.memberships.map((m) => ({
      organisationId: m.organisationId,
      organisationType: m.organisation?.type,
      roles: [...new Set([...m.roles.map((r) => r.role), m.role])],
    }));

    // Support grants (ADR-078) count as memberships ONLY for an ops session —
    // a token from the Ops client at authenticator level. Through the admin
    // app, or without the authenticator, a grant does nothing. They are
    // appended after the real memberships, so one never becomes the default
    // organisation below.
    const opsSession = isOpsSession(payload, this.opsClientId);
    if (opsSession) {
      const own = new Set(memberships.map((m) => m.organisationId));
      for (const grant of await this.supportAccess.findActiveForUser(user.id)) {
        if (own.has(grant.distributorId)) continue;
        memberships.push({
          organisationId: grant.distributorId,
          roles: [grant.role],
          supportGrantId: grant.id,
          expiresAt: grant.expiresAt,
        });
      }
    }

    return {
      sub: user.id,
      email: user.email,
      role: membership?.role,
      organisationId: membership?.organisationId,
      organisationIds: memberships.map((m) => m.organisationId),
      memberships,
      opsSession,
    };
  }
}
