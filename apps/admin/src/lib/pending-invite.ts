// The emailed link carries the invitation token in the URL, but the invitee is
// sent through Keycloak (sign up, verify email, sign in) and back, which can
// drop query params — and a verify-email link can land them on the app root.
// So the token is parked in sessionStorage for the trip. Storage can be
// unavailable (private windows, blocked site data): every access is guarded and
// the flow still works from the URL alone.
const KEY = 'stocdup_pending_staff_invite';

export function getPendingInviteToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setPendingInviteToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // fall back to the URL token
  }
}

export function clearPendingInviteToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
