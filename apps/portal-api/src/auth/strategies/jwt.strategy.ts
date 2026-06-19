import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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

  async validate(req: Request, payload: { sub: string; email?: string }) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    return { sub: payload.sub, email: payload.email, token };
  }
}
