// Server-only: imported exclusively by the /api/register route handler.
import nodemailer, { type Transporter } from 'nodemailer';

import type { Lead } from './lead-schema';

// Self-contained SMTP — deliberately NOT importing apps/api's mail module.
// Local dev defaults target the in-cluster MailHog (port-forward svc/wholo-mailhog 1025).
const HOST = process.env.WWW_SMTP_HOST || 'localhost';
const PORT = Number(process.env.WWW_SMTP_PORT || 1025);
const SECURE = process.env.WWW_SMTP_SECURE === 'true';
const USER = process.env.WWW_SMTP_USER || '';
const PASS = process.env.WWW_SMTP_PASS || '';
const FROM = process.env.LEADS_FROM || 'leads@stocdup.com';
const TO = process.env.LEADS_TO || FROM;

let transporter: Transporter | null = null;
function getTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      ...(USER ? { auth: { user: USER, pass: PASS } } : {}),
    });
  }
  return transporter;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NONE = '(not given)';

export async function sendLeadEmail(lead: Lead): Promise<void> {
  const rows: Array<[string, string]> = [
    ['Name', lead.name],
    ['Work email', lead.email],
    ['Business', lead.business],
    ['Role', lead.role || NONE],
    ['Interests', lead.interests.length ? lead.interests.join(', ') : NONE],
    ['Message', lead.message || NONE],
  ];

  const subject = `New Stocdup interest: ${lead.business}`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = `<!doctype html><html><body style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#0B1D3A">
<h2 style="margin:0 0 16px">New "Register interest" submission</h2>
<table style="border-collapse:collapse">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:6px 16px 6px 0;vertical-align:top;color:#5B6B7F">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`,
  )
  .join('')}
</table>
</body></html>`;

  await getTransport().sendMail({
    from: FROM,
    to: TO,
    replyTo: lead.email,
    subject,
    text,
    html,
  });
}
