import { HttpException, Injectable } from '@nestjs/common';
import type { AuthSession, AuthUser } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';
import type { KeycloakPrincipal } from './strategies/keycloak-jwt.strategy';

@Injectable()
export class AuthService {
  constructor(private api: ApiClientService) {}

  me(bearerToken: string) {
    return this.api.get('/auth/me', bearerToken);
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
   */
  async session(bearerToken: string, principal: KeycloakPrincipal): Promise<AuthSession> {
    try {
      const user = await this.api.get<AuthUser>('/auth/me', bearerToken);
      if (user.organisationType !== 'DISTRIBUTOR') {
        return { status: 'ACCESS_DENIED', user };
      }
      return { status: 'ACTIVE', user };
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 401) {
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
