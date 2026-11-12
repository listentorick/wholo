import { execFileSync } from 'child_process';
import { DOCS_SIGN_UP_EMAILS } from './ids';
import { clearMailTo } from './mailbox';

/**
 * Accounts a docs run creates by signing up (a customer accepting their invitation). The run
 * makes them in Keycloak through its registration page, so every reset removes them from
 * Keycloak again, and empties their inbox, or the next run's sign-up would find the email
 * already taken and read last run's emails.
 *
 * Keycloak is reached on localhost:3080 with the API's own admin client (wholo-api-admin,
 * its secret read from the cluster, never logged). The integration spec swaps this out
 * (setSignUpCleaner), as CI has no Keycloak or MailHog.
 */

export type SignUpCleaner = (emails: readonly string[]) => Promise<void>;

let cleaner: SignUpCleaner | null = null;

/** Replaces the cleaner (tests). Pass null to go back to Keycloak and MailHog. */
export function setSignUpCleaner(next: SignUpCleaner | null): void {
  cleaner = next;
}

export async function removeSignUps(log: (line: string) => void = () => {}): Promise<void> {
  await (cleaner ?? removeFromKeycloakAndMailHog)(DOCS_SIGN_UP_EMAILS);
  log(`Removed sign-ups: ${DOCS_SIGN_UP_EMAILS.join(', ')}.`);
}

const KEYCLOAK_URL = process.env.DOCS_KEYCLOAK_URL || 'http://localhost:3080';

async function removeFromKeycloakAndMailHog(emails: readonly string[]): Promise<void> {
  const kube = (args: string[]) => execFileSync('kubectl', args, { encoding: 'utf8' }).trim();
  const realm = kube(['get', 'configmap', 'wholo-api', '-o', 'jsonpath={.data.KEYCLOAK_REALM}']) || 'wholo';
  const clientId = kube(['get', 'configmap', 'wholo-api', '-o', 'jsonpath={.data.KEYCLOAK_ADMIN_CLIENT_ID}']) || 'wholo-api-admin';
  const secret = Buffer.from(kube(['get', 'secret', 'wholo-api', '-o', 'jsonpath={.data.KEYCLOAK_ADMIN_CLIENT_SECRET}']), 'base64').toString('utf8');
  if (!secret) throw new Error("The cluster's wholo-api secret has no KEYCLOAK_ADMIN_CLIENT_SECRET.");

  const tokenRes = await fetch(`${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret }),
  });
  if (!tokenRes.ok) throw new Error(`Keycloak refused the admin client (${tokenRes.status}).`);
  const { access_token: token } = (await tokenRes.json()) as { access_token: string };
  const auth = { Authorization: `Bearer ${token}` };

  for (const email of emails) {
    const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${realm}/users?exact=true&email=${encodeURIComponent(email)}`, { headers: auth });
    if (!res.ok) throw new Error(`Keycloak user search failed (${res.status}).`);
    for (const user of (await res.json()) as Array<{ id: string }>) {
      const del = await fetch(`${KEYCLOAK_URL}/admin/realms/${realm}/users/${user.id}`, { method: 'DELETE', headers: auth });
      if (!del.ok) throw new Error(`Keycloak refused to delete the sign-up for ${email} (${del.status}).`);
    }
    await clearMailTo(email);
  }
}
