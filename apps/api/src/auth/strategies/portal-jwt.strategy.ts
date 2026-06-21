import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';

export interface KeycloakIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
}

@Injectable()
export class PortalJwtStrategy extends PassportStrategy(Strategy, 'portal-jwt') {
  constructor(config: ConfigService) {
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
    });
  }

  validate(payload: KeycloakIdentity): KeycloakIdentity {
    // Reject unverified emails — prevents account takeover via email squatting
    if (!payload.email_verified) {
      throw new UnauthorizedException('Email address must be verified before accepting an invitation');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      given_name: payload.given_name,
      family_name: payload.family_name,
    };
  }
}
