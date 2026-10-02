/**
 * Regenerate Keycloak's email theme (apps/keycloak/themes/wholo/email) from
 * the shared email chrome — see src/mail/keycloak-email.ts.
 *
 * Usage: pnpm --filter @wholo/api keycloak:emails
 * Then rebuild the Keycloak image to ship the result.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { KEYCLOAK_EMAIL_THEME_DIR, renderKeycloakEmailTheme } from '../src/mail/keycloak-email';

async function main() {
  const files = await renderKeycloakEmailTheme();
  for (const [path, content] of Object.entries(files)) {
    const target = join(KEYCLOAK_EMAIL_THEME_DIR, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  console.log(`Wrote ${Object.keys(files).length} files to ${KEYCLOAK_EMAIL_THEME_DIR}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
