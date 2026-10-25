import { Injectable } from '@nestjs/common';
import type { PlatformDistributor, PlatformStats, SupportGrant } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';
import { OpenSupportAccessDto } from './dto/open-support-access.dto';

// Thin BFF over apps/api's platform and support-grant resources (ADR-078).
// Every rule — ops session, PLATFORM_ADMIN, grant limits — is enforced there;
// this only turns "me" into the caller's explicit user id.
@Injectable()
export class OpsService {
  constructor(private api: ApiClientService) {}

  stats(token: string) {
    return this.api.get<PlatformStats>('/platform/stats', token);
  }

  distributors(token: string, query: { q?: string; filter?: string }) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.filter) params.set('filter', query.filter);
    const qs = params.toString();
    return this.api.get<PlatformDistributor[]>(`/distributors${qs ? `?${qs}` : ''}`, token);
  }

  myGrants(userId: string, token: string) {
    return this.api.get<SupportGrant[]>(`/users/${encodeURIComponent(userId)}/support-grants`, token);
  }

  openAccess(userId: string, dto: OpenSupportAccessDto, token: string) {
    const { distributorId, reason, durationMinutes } = dto;
    return this.api.post<SupportGrant>(`/distributors/${encodeURIComponent(distributorId)}/support-grants`, token, { userId, reason, durationMinutes });
  }

  endAccess(distributorId: string, grantId: string, token: string) {
    return this.api.delete<SupportGrant>(`/distributors/${encodeURIComponent(distributorId)}/support-grants/${encodeURIComponent(grantId)}`, token);
  }
}
