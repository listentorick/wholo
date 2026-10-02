import { join } from 'path';
import { compileMjmlTemplate } from './mail-template';

// Keycloak sends its own emails (verify email, password reset, security
// notices) from FreeMarker templates in its email theme. To keep those in the
// same layout as the emails apps/api sends, they are generated here from the
// shared MJML chrome and committed into the theme — Keycloak never runs this
// code, and apps/api never sends these emails.
//
//   pnpm --filter @wholo/api keycloak:emails
//
// keycloak-email.spec.ts fails when the committed theme no longer matches what
// this module renders (e.g. the shared header partial changed).

export const KEYCLOAK_EMAIL_THEME_DIR = join(__dirname, '..', '..', '..', 'keycloak', 'themes', 'wholo', 'email');

const SUPPORT_EMAIL = 'support@stocdup.com';

// FreeMarker for "how long the link is valid", exactly as Keycloak's stock
// templates call it.
const EXPIRY = '${linkExpirationFormatter(linkExpiration)}';

export interface KeycloakEmail {
  /** Template name Keycloak looks up, e.g. `password-reset` (→ html/password-reset.ftl). */
  name: string;
  headline: string;
  /**
   * Message keys this email owns, in Keycloak's MessageFormat (`{0}`, `{1}`…
   * are the arguments the stock template passes — positions must not change).
   * Keys ending `Html` are the HTML body; the others are the subject and the
   * plain-text body read by Keycloak's stock text template.
   */
  messages: Record<string, string>;
  /**
   * FreeMarker expression producing the HTML body: the stock template's own
   * `msg(...)` call, unchanged, so only the wording (in `messages`) differs
   * from what Keycloak ships and tests.
   */
  body: string;
  /** Present on emails whose purpose is a link; the button points at `${link}`. */
  buttonLabel?: string;
  /** Small print under the band. May contain FreeMarker interpolations. */
  note?: string;
  /** FreeMarker directives that must run before the markup. */
  preamble?: string;
}

const html = (key: string, args: string) => `\${kcSanitize(msg("${key}", ${args}))?no_esc}`;

const IGNORE = (what: string) => `This link expires in ${EXPIRY}. ${what}`;
const NOT_YOU = `If this wasn't you, contact ${SUPPORT_EMAIL}.`;

export const KEYCLOAK_EMAILS: KeycloakEmail[] = [
  {
    name: 'email-verification',
    headline: 'Verify your email address',
    messages: {
      emailVerificationSubject: 'Verify your email address for Stocdup',
      emailVerificationBody:
        "Confirm this is your email address to finish creating your Stocdup account:\n\n{0}\n\nThis link expires in {3}.\n\nIf you didn't create a Stocdup account, you can ignore this email.",
      emailVerificationBodyHtml: 'Confirm this is your email address to finish creating your Stocdup account.',
    },
    body: html('emailVerificationBodyHtml', 'link, linkExpiration, realmName, linkExpirationFormatter(linkExpiration)'),
    buttonLabel: 'Verify email address',
    note: IGNORE("If you didn't create a Stocdup account, you can ignore this email."),
  },
  {
    name: 'email-verification-with-code',
    headline: 'Verify your email address',
    messages: {
      emailVerificationBodyCode: 'Enter this code to verify your email address for Stocdup:\n\n{0}',
      emailVerificationBodyCodeHtml: 'Enter this code to verify your email address for Stocdup: <strong>{0}</strong>',
    },
    body: html('emailVerificationBodyCodeHtml', 'code'),
    note: "If you didn't create a Stocdup account, you can ignore this email.",
  },
  {
    name: 'password-reset',
    headline: 'Reset your password',
    messages: {
      passwordResetSubject: 'Reset your Stocdup password',
      passwordResetBody:
        "We received a request to reset the password for your Stocdup account. Use this link to choose a new one:\n\n{0}\n\nThis link expires in {3}.\n\nIf you didn't ask to reset your password, you can ignore this email and nothing will change.",
      passwordResetBodyHtml: 'We received a request to reset the password for your Stocdup account.',
    },
    body: html('passwordResetBodyHtml', 'link, linkExpiration, realmName, linkExpirationFormatter(linkExpiration)'),
    buttonLabel: 'Reset password',
    note: IGNORE("If you didn't ask to reset your password, you can ignore this email and nothing will change."),
  },
  {
    name: 'executeActions',
    headline: 'Update your account',
    messages: {
      executeActionsSubject: 'Update your Stocdup account',
      executeActionsBody:
        "You've been asked to update your Stocdup account: {3}. Use this link to get started:\n\n{0}\n\nThis link expires in {4}.\n\nIf you weren't expecting this, you can ignore this email and nothing will change.",
      executeActionsBodyHtml: "You've been asked to update your Stocdup account: <strong>{3}</strong>.",
    },
    // Builds the comma-separated list of requested actions — Keycloak's own
    // stock preamble for this template, unchanged.
    preamble:
      '<#outputformat "plainText">\n' +
      '<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>\n' +
      '</#outputformat>\n',
    body: html(
      'executeActionsBodyHtml',
      'link, linkExpiration, realmName, requiredActionsText, linkExpirationFormatter(linkExpiration)',
    ),
    buttonLabel: 'Update account',
    note: IGNORE("If you weren't expecting this, you can ignore this email and nothing will change."),
  },
  {
    name: 'email-update-confirmation',
    headline: 'Confirm your new email address',
    messages: {
      emailUpdateConfirmationSubject: 'Confirm your new email address for Stocdup',
      emailUpdateConfirmationBody:
        "Confirm {1} as the new email address for your Stocdup account:\n\n{0}\n\nThis link expires in {3}.\n\nIf you didn't ask to change your email address, you can ignore this email.",
      emailUpdateConfirmationBodyHtml: 'Confirm <strong>{1}</strong> as the new email address for your Stocdup account.',
    },
    body: html('emailUpdateConfirmationBodyHtml', 'link, newEmail, realmName, linkExpirationFormatter(linkExpiration)'),
    buttonLabel: 'Confirm email address',
    note: IGNORE("If you didn't ask to change your email address, you can ignore this email."),
  },
  {
    name: 'org-invite',
    headline: "You've been invited",
    messages: {
      orgInviteSubject: "You've been invited to join {0}",
      orgInviteBody:
        "You've been invited to join {3} on Stocdup. Use this link to accept:\n\n{0}\n\nThis link expires in {4}.\n\nIf you don't want to join, you can ignore this email.",
      orgInviteBodyPersonalized:
        "Hi {5} {6},\n\nYou've been invited to join {3} on Stocdup. Use this link to accept:\n\n{0}\n\nThis link expires in {4}.\n\nIf you don't want to join, you can ignore this email.",
      orgInviteBodyHtml: "You've been invited to join <strong>{3}</strong> on Stocdup.",
    },
    body: html(
      'orgInviteBodyHtml',
      'link, linkExpiration, realmName, organization.name, linkExpirationFormatter(linkExpiration)',
    ),
    buttonLabel: 'Accept invitation',
    note: IGNORE("If you don't want to join, you can ignore this email."),
  },
  {
    name: 'identity-provider-link',
    headline: 'Link your account',
    messages: {
      identityProviderLinkSubject: 'Link your {0} account to Stocdup',
      identityProviderLinkBody:
        "Someone wants to link your Stocdup account with the {0} account of {2}. If this was you, use this link to link the accounts:\n\n{3}\n\nThis link expires in {5}.\n\nOnce linked, you'll be able to sign in to Stocdup through {0}. If this wasn't you, you can ignore this email.",
      identityProviderLinkBodyHtml:
        "Someone wants to link your Stocdup account with the <strong>{0}</strong> account of {2}. Once linked, you'll be able to sign in to Stocdup through {0}.",
    },
    body: html(
      'identityProviderLinkBodyHtml',
      'identityProviderDisplayName, realmName, identityProviderContext.username, link, linkExpiration, linkExpirationFormatter(linkExpiration)',
    ),
    buttonLabel: 'Link account',
    note: IGNORE("If this wasn't you, you can ignore this email."),
  },
  {
    name: 'event-login_error',
    headline: 'Failed sign-in attempt',
    messages: {
      eventLoginErrorSubject: 'Failed sign-in attempt on your Stocdup account',
      eventLoginErrorBody: `A failed sign-in attempt was made on your Stocdup account on {0} from {1}. ${NOT_YOU}`,
      eventLoginErrorBodyHtml: 'A failed sign-in attempt was made on your Stocdup account on {0} from {1}.',
    },
    body: html('eventLoginErrorBodyHtml', 'event.date, event.ipAddress'),
    note: NOT_YOU,
  },
  {
    name: 'event-update_password',
    headline: 'Your password was changed',
    messages: {
      eventUpdatePasswordSubject: 'Your Stocdup password was changed',
      eventUpdatePasswordBody: `Your Stocdup password was changed on {0} from {1}. ${NOT_YOU}`,
      eventUpdatePasswordBodyHtml: 'Your Stocdup password was changed on {0} from {1}.',
    },
    body: html('eventUpdatePasswordBodyHtml', 'event.date, event.ipAddress'),
    note: NOT_YOU,
  },
  {
    name: 'event-update_totp',
    headline: 'Two-step sign-in updated',
    messages: {
      eventUpdateTotpSubject: 'Two-step sign-in was updated on your Stocdup account',
      eventUpdateTotpBody: `Two-step sign-in was updated for your Stocdup account on {0} from {1}. ${NOT_YOU}`,
      eventUpdateTotpBodyHtml: 'Two-step sign-in was updated for your Stocdup account on {0} from {1}.',
    },
    body: html('eventUpdateTotpBodyHtml', 'event.date, event.ipAddress'),
    note: NOT_YOU,
  },
  {
    name: 'event-remove_totp',
    headline: 'Two-step sign-in removed',
    messages: {
      eventRemoveTotpSubject: 'Two-step sign-in was removed from your Stocdup account',
      eventRemoveTotpBody: `Two-step sign-in was removed from your Stocdup account on {0} from {1}. ${NOT_YOU}`,
      eventRemoveTotpBodyHtml: 'Two-step sign-in was removed from your Stocdup account on {0} from {1}.',
    },
    body: html('eventRemoveTotpBodyHtml', 'event.date, event.ipAddress'),
    note: NOT_YOU,
  },
  {
    name: 'event-update_credential',
    headline: 'Sign-in method changed',
    messages: {
      eventUpdateCredentialSubject: 'A sign-in method was changed on your Stocdup account',
      eventUpdateCredentialBody: `Your {0} sign-in method was changed on {1} from {2}. ${NOT_YOU}`,
      eventUpdateCredentialBodyHtml: 'Your <strong>{0}</strong> sign-in method was changed on {1} from {2}.',
    },
    body: html('eventUpdateCredentialBodyHtml', 'event.getDetail("credential_type")!"unknown", event.date, event.ipAddress'),
    note: NOT_YOU,
  },
  {
    name: 'event-remove_credential',
    headline: 'Sign-in method removed',
    messages: {
      eventRemoveCredentialSubject: 'A sign-in method was removed from your Stocdup account',
      eventRemoveCredentialBody: `Your {0} sign-in method was removed on {1} from {2}. ${NOT_YOU}`,
      eventRemoveCredentialBodyHtml: 'Your <strong>{0}</strong> sign-in method was removed on {1} from {2}.',
    },
    body: html('eventRemoveCredentialBodyHtml', 'event.getDetail("credential_type")!"unknown", event.date, event.ipAddress'),
    note: NOT_YOU,
  },
  {
    name: 'event-user_disabled_by_temporary_lockout',
    headline: 'Account temporarily locked',
    messages: {
      eventUserDisabledByTemporaryLockoutSubject: 'Your Stocdup account is temporarily locked',
      eventUserDisabledByTemporaryLockoutBody: `Your Stocdup account was temporarily locked on {0} after too many failed sign-in attempts. You can try again later. If you need help, contact ${SUPPORT_EMAIL}.`,
      eventUserDisabledByTemporaryLockoutHtml:
        'Your Stocdup account was temporarily locked on {0} after too many failed sign-in attempts.',
    },
    body: html('eventUserDisabledByTemporaryLockoutHtml', 'event.date'),
    note: `You can try again later. If you need help, contact ${SUPPORT_EMAIL}.`,
  },
  {
    name: 'event-user_disabled_by_permanent_lockout',
    headline: 'Account locked',
    messages: {
      eventUserDisabledByPermanentLockoutSubject: 'Your Stocdup account is locked',
      eventUserDisabledByPermanentLockoutBody: `Your Stocdup account was locked on {0} after too many failed sign-in attempts. Contact ${SUPPORT_EMAIL} to regain access.`,
      eventUserDisabledByPermanentLockoutHtml:
        'Your Stocdup account was locked on {0} after too many failed sign-in attempts.',
    },
    body: html('eventUserDisabledByPermanentLockoutHtml', 'event.date'),
    note: `Contact ${SUPPORT_EMAIL} to regain access.`,
  },
  {
    name: 'email-test',
    headline: 'Test email',
    messages: {
      emailTestSubject: 'Stocdup test email',
      emailTestBody: 'This is a test email from Stocdup.',
      emailTestBodyHtml: 'This is a test email from Stocdup.',
    },
    body: html('emailTestBodyHtml', 'realmName'),
  },
];

// FreeMarker goes in AFTER the MJML compile, via these markers: MJML parses
// its input as HTML, and a directive such as <#nested> is not HTML.
const SLOT = { body: '@@KC_BODY@@', note: '@@KC_NOTE@@', link: '@@KC_LINK@@', icon: '@@KC_ICON@@' };

// Anything FreeMarker would try to execute. The compiled chrome must contain
// none of it, or Keycloak would fail (or worse, evaluate it) at send time.
const FREEMARKER_SYNTAX = /\$\{|#\{|<\/?[#@]/;

interface Layout {
  title: string;
  headline?: string;
  body: string;
  buttonLabel?: string;
  note?: string;
}

async function renderLayout(layout: Layout): Promise<string> {
  const compiled = await compileMjmlTemplate('keycloak-email', {
    title: layout.title,
    headline: layout.headline ?? '',
    body: SLOT.body,
    bodyGap: layout.buttonLabel ? '24' : '0',
    buttonLabel: layout.buttonLabel ?? '',
    link: SLOT.link,
    note: layout.note ? SLOT.note : '',
    stocdupIconUrl: SLOT.icon,
    stocdupSupportEmail: SUPPORT_EMAIL,
  });
  if (FREEMARKER_SYNTAX.test(compiled)) {
    throw new Error('Compiled Keycloak email layout contains FreeMarker syntax outside the intended slots');
  }
  // Function replacers: a plain replacement string would treat "$" specially.
  return compiled
    .replace(SLOT.body, () => layout.body)
    .replace(SLOT.note, () => layout.note ?? '')
    .replace(SLOT.link, () => '${link}')
    .replace(SLOT.icon, () => '${url.resourcesUrl}/img/stocdup-logo-only.png');
}

const GENERATED = '<#-- Generated by apps/api (pnpm --filter @wholo/api keycloak:emails). Do not edit by hand. -->\n';

async function renderEmail(email: KeycloakEmail): Promise<string> {
  const markup = await renderLayout({ ...email, title: email.headline });
  return GENERATED + (email.preamble ?? '') + markup + '\n';
}

// The wrapper Keycloak's stock templates import. Every email above overrides
// its stock template outright, so this only dresses emails a future Keycloak
// version adds — they arrive in the Stocdup chrome instead of bare paragraphs.
async function renderWrapper(): Promise<string> {
  const markup = await renderLayout({ title: 'Stocdup', body: '<#nested>' });
  return GENERATED + '<#macro emailLayout>\n' + markup + '\n</#macro>\n';
}

// java.util.Properties + MessageFormat: one logical line per key, and a
// literal apostrophe must be doubled or MessageFormat swallows it.
function renderMessages(): string {
  const lines = KEYCLOAK_EMAILS.flatMap((email) =>
    Object.entries(email.messages).map(
      ([key, value]) => `${key}=${value.replace(/'/g, "''").replace(/\n/g, '\\n')}`,
    ),
  );
  return (
    '# Generated by apps/api (pnpm --filter @wholo/api keycloak:emails). Do not edit by hand.\n' +
    lines.join('\n') +
    '\n'
  );
}

/** Every generated file of the Keycloak email theme, keyed by its path inside the theme. */
export async function renderKeycloakEmailTheme(): Promise<Record<string, string>> {
  const files: Record<string, string> = {
    'messages/messages_en.properties': renderMessages(),
    'html/template.ftl': await renderWrapper(),
  };
  for (const email of KEYCLOAK_EMAILS) {
    files[`html/${email.name}.ftl`] = await renderEmail(email);
  }
  return files;
}
