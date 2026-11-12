/**
 * The local MailHog inbox (helm: wholo-mailhog, UI and API on localhost:30825), which
 * catches every email the local cluster sends: the app's own (invitations, order emails)
 * and Keycloak's (verify your email). Scenarios that start in, or go through, the reader's
 * email read it from here.
 */

const MAILHOG_URL = process.env.DOCS_MAILHOG_URL || 'http://localhost:30825';

interface MimePart {
  Headers: Record<string, string[]>;
  Body: string;
  MIME?: { Parts: MimePart[] } | null;
}

interface MailHogMessage {
  ID: string;
  Created: string;
  Content: MimePart;
  MIME?: { Parts: MimePart[] } | null;
}

export interface Email {
  subject: string;
  html: string;
  receivedAt: Date;
}

async function messagesTo(address: string): Promise<MailHogMessage[]> {
  const url = `${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(address)}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MailHog search failed (${res.status}); is the cluster's MailHog up at ${MAILHOG_URL}?`);
  const body = (await res.json()) as { items: MailHogMessage[] };
  return body.items;
}

/** Deletes every email sent to this address, so the next one read is the run's own. */
export async function clearMailTo(address: string): Promise<number> {
  const messages = await messagesTo(address);
  for (const m of messages) {
    const res = await fetch(`${MAILHOG_URL}/api/v1/messages/${m.ID}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`MailHog delete failed (${res.status})`);
  }
  return messages.length;
}

/**
 * The newest email to this address whose subject contains `subject` (any, if not given),
 * waiting for it to arrive (sending is asynchronous). Pass a subject whenever more than one
 * email can be waiting: MailHog's receipt times come from different senders' clocks, so
 * "newest" alone can pick the wrong one.
 */
export async function newestMailTo(address: string, { timeoutMs = 60_000, subject }: { timeoutMs?: number; subject?: string } = {}): Promise<Email> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const emails = (await messagesTo(address))
      .map(toEmail)
      .filter((e) => !subject || e.subject.toLowerCase().includes(subject.toLowerCase()))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    if (emails.length) return emails[0];
    if (Date.now() > deadline) {
      throw new Error(`No email to ${address}${subject ? ` with "${subject}" in its subject` : ''} arrived within ${timeoutMs / 1000}s. Is wholo-worker running?`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function header(part: MimePart, name: string): string {
  const key = Object.keys(part.Headers ?? {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? part.Headers[key][0] ?? '' : '';
}

function decodeBody(part: MimePart): string {
  const encoding = header(part, 'Content-Transfer-Encoding').toLowerCase();
  const charset = /charset="?([^";]+)"?/i.exec(header(part, 'Content-Type'))?.[1] ?? 'utf-8';
  let bytes: Buffer;
  if (encoding === 'base64') {
    bytes = Buffer.from(part.Body.replace(/\s+/g, ''), 'base64');
  } else if (encoding === 'quoted-printable') {
    const soft = part.Body.replace(/=\r?\n/g, '');
    const out: number[] = [];
    for (let i = 0; i < soft.length; i += 1) {
      if (soft[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
        out.push(parseInt(soft.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out.push(...Buffer.from(soft[i], 'utf8'));
      }
    }
    bytes = Buffer.from(out);
  } else {
    bytes = Buffer.from(part.Body, 'utf8');
  }
  return new TextDecoder(charset).decode(bytes);
}

function findPart(part: MimePart, type: string): MimePart | null {
  if (header(part, 'Content-Type').toLowerCase().startsWith(type)) return part;
  for (const child of part.MIME?.Parts ?? []) {
    const found = findPart(child, type);
    if (found) return found;
  }
  return null;
}

/** RFC 2047 encoded words in a header (=?UTF-8?Q?...?= / =?UTF-8?B?...?=). */
function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([QBqb])\?([^?]*)\?=/g, (_, charset: string, kind: string, text: string) => {
    const bytes = kind.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1');
    return new TextDecoder(charset).decode(bytes);
  });
}

function toEmail(message: MailHogMessage): Email {
  const root: MimePart = { ...message.Content, MIME: message.MIME ?? null };
  const html = findPart(root, 'text/html');
  const text = findPart(root, 'text/plain') ?? root;
  return {
    subject: decodeHeader(header(message.Content, 'Subject')),
    html: html ? decodeBody(html) : `<pre>${decodeBody(text).replace(/</g, '&lt;')}</pre>`,
    receivedAt: new Date(message.Created),
  };
}
