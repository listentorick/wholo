import { apiFetch } from './base';

export const invitationsApi = {
  accept(token: string, inviteToken: string): Promise<{ distributorSlug: string | null }> {
    return apiFetch('/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken }),
      token,
    });
  },
};
