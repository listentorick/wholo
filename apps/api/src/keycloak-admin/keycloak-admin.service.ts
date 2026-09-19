import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Minimal Keycloak Admin REST client for the one thing apps/api needs it for:
 * stopping a removed team member from signing in. Authenticates as a dedicated
 * service-account client (`KEYCLOAK_ADMIN_CLIENT_ID`, client-credentials grant)
 * that holds only `realm-management: manage-users` — never the master admin.
 *
 * Runs in the worker process (via the outbox), not on the request path, so a
 * Keycloak outage delays the disable and is retried rather than failing the
 * Owner's "Remove" click. The database-side removal has already taken effect
 * by then.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private token: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Disables the Keycloak user and ends every session they have. Idempotent:
   * a user who no longer exists in Keycloak counts as already disabled.
   */
  async disableUser(keycloakId: string): Promise<void> {
    const userUrl = `${this.adminBase()}/users/${encodeURIComponent(keycloakId)}`;

    const update = await this.request(userUrl, { method: 'PUT', body: JSON.stringify({ enabled: false }) });
    if (update.status === 404) {
      this.logger.warn(`Keycloak user ${keycloakId} not found — nothing to disable`);
      return;
    }
    await this.assertOk(update, `disable user ${keycloakId}`);

    // Disabling stops NEW logins; this also ends sessions already open.
    const logout = await this.request(`${userUrl}/logout`, { method: 'POST' });
    if (logout.status !== 404) {
      await this.assertOk(logout, `log out user ${keycloakId}`);
    }
    this.logger.log(`Disabled Keycloak user ${keycloakId} and ended their sessions`);
  }

  private realmBase(): string {
    const base = this.config.get<string>('KEYCLOAK_URL', 'http://localhost:3080').replace(/\/+$/, '');
    return `${base}/realms/${this.config.get<string>('KEYCLOAK_REALM', 'wholo')}`;
  }

  private adminBase(): string {
    const base = this.config.get<string>('KEYCLOAK_URL', 'http://localhost:3080').replace(/\/+$/, '');
    return `${base}/admin/realms/${this.config.get<string>('KEYCLOAK_REALM', 'wholo')}`;
  }

  private async request(url: string, init: { method: string; body?: string }): Promise<Response> {
    const accessToken = await this.getAccessToken();
    return fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  }

  private async getAccessToken(): Promise<string> {
    // 30s of headroom so a token is never used right at its expiry.
    if (this.token && this.token.expiresAt - 30_000 > Date.now()) return this.token.accessToken;

    const clientId = this.config.get<string>('KEYCLOAK_ADMIN_CLIENT_ID', 'wholo-api-admin');
    const clientSecret = this.config.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET');
    if (!clientSecret) {
      throw new Error('KEYCLOAK_ADMIN_CLIENT_SECRET is not set — cannot disable Keycloak users');
    }

    const res = await fetch(`${this.realmBase()}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    await this.assertOk(res, 'obtain a Keycloak admin token');

    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.accessToken;
  }

  private async assertOk(res: Response, action: string): Promise<void> {
    if (res.ok) return;
    // A stale/invalid cached token: drop it so the retry re-authenticates.
    if (res.status === 401) this.token = null;
    throw new Error(`Keycloak could not ${action}: ${res.status} ${res.statusText}`);
  }
}
