/**
 * Redact an email address for logs (ADR-064): keep the first character of the
 * local part and the full domain — `rick@example.com` → `r***@example.com`.
 * Enough to correlate a delivery failure without shipping the recipient's
 * address to Loki.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(none)';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
