import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSession, AuthUser } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';
import { AppMode, appMode, mayUseApp, profilePath } from './app-mode';
import type { KeycloakPrincipal } from './strategies/keycloak-jwt.strategy';

@Injectable()
export class AuthService {
  private readonly mode: AppMode;

  constructor(
    private api: ApiClientService,
    config: ConfigService,
  ) {
    this.mode = appMode(config.get<string>('APP_MODE'));
  }

  /** The profile in the organisation this request is about (the Ops app's selection, if any). */
  me(bearerToken: string, organisationId?: string) {
    return this.api.get(profilePath(this.mode, organisationId), bearerToken);
  }

  /**
   * Four-state session check. The caller's token is already JWKS-validated by
   * KeycloakJwtStrategy, so an upstream 401 from /auth/me can only mean the
   * identity has no Wholo user yet — i.e. onboarding is required. A Wholo user
   * that exists but isn't on a DISTRIBUTOR-type organisation (a trade customer,
   * or a user with no membership at all) is denied admin access — same rule
   * JwtStrategy enforces for every other admin-api route (ADR-053), applied
   * here too since this endpoint resolves the profile itself rather than going
   * through that guard. Any other upstream failure is a real error and is
   * rethrown.
   *
   * In the Ops app (ADR-078) the session is the operator's home organisation,
   * which must be Stocdup's PLATFORM one; a selected wholesaler is checked on
   * every other request instead. Ops never offers distributor onboarding.
   */
  async session(bearerToken: string, principal: KeycloakPrincipal): Promise<AuthSession> {
    try {
      const user = await this.api.get<AuthUser>(profilePath(this.mode, undefined), bearerToken);
      if (!mayUseApp(user, this.mode, false)) {
        return { status: 'ACCESS_DENIED', user };
      }
      return { status: 'ACTIVE', user };
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 401) {
        if (this.mode === 'ops') return { status: 'ACCESS_DENIED' };
        return {
          status: 'ONBOARDING_REQUIRED',
          identity: {
            email: principal.email ?? '',
            firstName: principal.given_name ?? '',
            lastName: principal.family_name ?? '',
          },
        };
      }
      throw e;
    }
  }
}
