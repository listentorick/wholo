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
   * Tri-state session check. The caller's token is already JWKS-validated by
   * KeycloakJwtStrategy, so an upstream 401 from /auth/me can only mean the
   * identity has no Wholo user yet — i.e. onboarding is required. Any other
   * upstream failure is a real error and is rethrown.
   */
  async session(bearerToken: string, principal: KeycloakPrincipal): Promise<AuthSession> {
    try {
      const user = await this.api.get<AuthUser>('/auth/me', bearerToken);
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
