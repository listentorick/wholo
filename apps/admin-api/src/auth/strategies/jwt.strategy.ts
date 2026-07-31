import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { OrganisationType } from '@prisma/client';
import { ApiClientService } from '../../api-client/api-client.service';

interface WholoProfile {
  id: string;
  email: string;
  role: string;
  organisationId: string;
  organisationType?: OrganisationType;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly apiClient: ApiClientService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${config.get<string>('KEYCLOAK_URL', 'http://localhost:8080')}/realms/${config.get<string>('KEYCLOAK_REALM', 'wholo')}/protocol/openid-connect/certs`,
      }),
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: string; email?: string }) {
    const token = (req as any).headers['authorization']?.replace(/^Bearer\s+/i, '');
    let profile: WholoProfile;
    try {
      profile = await this.apiClient.get<WholoProfile>('/auth/me', token);
    } catch {
      throw new UnauthorizedException('No Wholo user found for this identity');
    }
    // Trade customers must not reach the admin surface at all (ADR-053) — this is
    // decided from Wholo's own Membership/Organisation data via /auth/me, never from
    // which Keycloak client issued the token.
    if (profile.organisationType !== OrganisationType.DISTRIBUTOR) {
      throw new UnauthorizedException('This application is for distributor accounts');
    }
    return {
      sub: profile.id,
      email: profile.email,
      token,
      organisationId: profile.organisationId,
      role: profile.role,
    };
  }
}
