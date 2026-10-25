import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import type { AuthAccess, AuthUser } from '@wholo/types';
import { ApiClientService } from '../../api-client/api-client.service';
import { AppMode, appMode, mayUseApp, profilePath, requestedOrganisation } from '../app-mode';

interface WholoProfile {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  organisationId: string;
  organisationType?: AuthUser['organisationType'];
  access?: AuthAccess;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly mode: AppMode;

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
    this.mode = appMode(config.get<string>('APP_MODE'));
  }

  async validate(req: Request, payload: { sub: string; email?: string }) {
    const token = (req as any).headers['authorization']?.replace(/^Bearer\s+/i, '');
    const selected = requestedOrganisation(this.mode, (req as any).headers);
    let profile: WholoProfile;
    try {
      profile = await this.apiClient.get<WholoProfile>(profilePath(this.mode, selected), token);
    } catch (e) {
      // A refused selection is a 403, not a sign-in problem: the Ops app
      // reacts by dropping the wholesaler ("your access has ended").
      if (selected && e instanceof HttpException && e.getStatus() === 403) {
        throw new ForbiddenException('Your access to this wholesaler has ended');
      }
      throw new UnauthorizedException('No Wholo user found for this identity');
    }
    // Who may use this app is decided from Wholo's own Membership/Organisation
    // data via /auth/me (ADR-053, ADR-078) — never from which Keycloak client
    // issued the token. Trade customers never reach either app.
    if (!mayUseApp(profile, this.mode, Boolean(selected))) {
      if (selected) throw new ForbiddenException('Your access to this wholesaler has ended');
      throw new UnauthorizedException(this.mode === 'ops' ? 'This application is for Stocdup operators' : 'This application is for distributor accounts');
    }
    return {
      sub: profile.id,
      email: profile.email,
      token,
      organisationId: profile.organisationId,
      roles: profile.roles,
      permissions: profile.permissions,
      access: profile.access,
    };
  }
}
