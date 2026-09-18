import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { passportJwtSecret } from 'jwks-rsa';
import { ApiClientService } from '../../api-client/api-client.service';

interface WholoProfile {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  organisationId: string;
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
        jwksUri: `${config.get<string>('KEYCLOAK_URL', 'http://localhost:3080')}/realms/${config.get<string>('KEYCLOAK_REALM', 'wholo')}/protocol/openid-connect/certs`,
      }),
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: string; email?: string }) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    let profile: WholoProfile;
    try {
      profile = await this.apiClient.get<WholoProfile>('/auth/me', token);
    } catch {
      throw new UnauthorizedException('No Wholo user found for this identity');
    }
    // Unlike admin-api, deliberately no organisationType gate here (ADR-053) —
    // portal-api must accept both trade customers and a DISTRIBUTOR_ADMIN
    // holding a wholo-portal token for order-as impersonation.
    return {
      sub: profile.id,
      email: profile.email,
      token,
      organisationId: profile.organisationId,
      roles: profile.roles,
      permissions: profile.permissions,
    };
  }
}
