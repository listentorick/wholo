import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { passportJwtSecret } from 'jwks-rsa';

export interface KeycloakPrincipal {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  token?: string;
}

/**
 * Signature-only Keycloak validation (no Wholo user lookup), for routes that
 * must accept identities with no Wholo user yet — the onboarding surface.
 * Everything else stays on the default JwtStrategy, which rejects unknowns.
 */
@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, 'keycloak-jwt') {
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
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: { sub: string; email?: string; given_name?: string; family_name?: string },
  ): KeycloakPrincipal {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    return {
      sub: payload.sub,
      email: payload.email,
      given_name: payload.given_name,
      family_name: payload.family_name,
      token,
    };
  }
}
