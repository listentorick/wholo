import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { ApiClientService } from '../../api-client/api-client.service';

interface WholoProfile {
  id: string;
  email: string;
  role: string;
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
      profile = await this.apiClient.getAsBearer<WholoProfile>('/auth/me', token);
    } catch {
      throw new UnauthorizedException('No Wholo user found for this identity');
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
