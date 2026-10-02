import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { KEYCLOAK_EMAILS, KEYCLOAK_EMAIL_THEME_DIR, renderKeycloakEmailTheme } from './keycloak-email';

// The emails Keycloak 26.2 can send. An email missing from KEYCLOAK_EMAILS
// would still go out, just in the bare fallback wrapper with stock wording.
const STOCK_EMAILS = [
  'email-test',
  'email-update-confirmation',
  'email-verification',
  'email-verification-with-code',
  'event-login_error',
  'event-remove_credential',
  'event-remove_totp',
  'event-update_credential',
  'event-update_password',
  'event-update_totp',
  'event-user_disabled_by_permanent_lockout',
  'event-user_disabled_by_temporary_lockout',
  'executeActions',
  'identity-provider-link',
  'org-invite',
  'password-reset',
];

describe('Keycloak email theme', () => {
  let files: Record<string, string>;

  beforeAll(async () => {
    files = await renderKeycloakEmailTheme();
  });

  it('is committed up to date — regenerate with `pnpm --filter @wholo/api keycloak:emails`', () => {
    for (const [path, content] of Object.entries(files)) {
      const committed = join(KEYCLOAK_EMAIL_THEME_DIR, path);
      expect({ path, exists: existsSync(committed) }).toEqual({ path, exists: true });
      expect({ path, content: readFileSync(committed, 'utf8') }).toEqual({ path, content });
    }
  });

  it('covers every email Keycloak sends', () => {
    expect(KEYCLOAK_EMAILS.map((email) => email.name).sort()).toEqual(STOCK_EMAILS);
    for (const name of STOCK_EMAILS) {
      expect(Object.keys(files)).toContain(`html/${name}.ftl`);
    }
  });

  it('gives every email the Stocdup header and support footer', () => {
    for (const name of STOCK_EMAILS) {
      const html = files[`html/${name}.ftl`];
      expect(html).toContain('${url.resourcesUrl}/img/stocdup-logo-only.png');
      expect(html).toContain('Need help using Stocdup? Contact support@stocdup.com.');
    }
  });

  it('puts the action link and its expiry in each email that asks the reader to act', () => {
    const withButton = KEYCLOAK_EMAILS.filter((email) => email.buttonLabel);
    expect(withButton.map((email) => email.name)).toEqual(
      expect.arrayContaining(['email-verification', 'password-reset', 'executeActions']),
    );
    for (const email of withButton) {
      const html = files[`html/${email.name}.ftl`];
      expect(html).toContain('href="${link}"');
      expect(html).toContain(email.buttonLabel);
      expect(html).toContain('This link expires in ${linkExpirationFormatter(linkExpiration)}.');
    }
  });

  it('offers no button on notice-only emails', () => {
    expect(files['html/event-update_password.ftl']).not.toContain('${link}');
  });

  it('wraps emails it does not know about in the same layout', () => {
    const wrapper = files['html/template.ftl'];
    expect(wrapper).toContain('<#macro emailLayout>');
    expect(wrapper).toContain('<#nested>');
    expect(wrapper).toContain('${url.resourcesUrl}/img/stocdup-logo-only.png');
  });

  it('writes messages Keycloak can format: one line per key, apostrophes doubled', () => {
    const lines = files['messages/messages_en.properties'].trimEnd().split('\n').slice(1);
    const keys = lines.map((line) => line.slice(0, line.indexOf('=')));

    expect(keys).toEqual(KEYCLOAK_EMAILS.flatMap((email) => Object.keys(email.messages)));
    expect(new Set(keys).size).toBe(keys.length);
    for (const line of lines) {
      expect(line.replace(/''/g, '')).not.toContain("'");
    }
    expect(lines).toContain('emailVerificationSubject=Verify your email address for Stocdup');
  });
});
