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

// Which invitation this tab has already asked Keycloak "is anyone signed in?"
// about (the accept page checks once per link per tab — see its effect).
const CHECKED_KEY = 'stocdup_staff_invite_session_checked';

export function isSessionCheckedFor(token: string): boolean {
  try {
    return sessionStorage.getItem(CHECKED_KEY) === token;
  } catch {
    // Without storage we can't remember the check; skip it rather than loop.
    return true;
  }
}

export function markSessionCheckedFor(token: string): void {
  try {
    sessionStorage.setItem(CHECKED_KEY, token);
  } catch {
    // isSessionCheckedFor already reports true without storage
  }
}

export function clearPendingInviteToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
