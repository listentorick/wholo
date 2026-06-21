import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';

export interface KeycloakIdentity {
  sub: string;
  email: string;
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
    return {
      sub: payload.sub,
      email: payload.email,
      given_name: payload.given_name,
      family_name: payload.family_name,
    };
  }
}
