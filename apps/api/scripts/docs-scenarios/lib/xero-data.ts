import { PrismaClient } from '@prisma/client';
import { XERO_DATA, XERO_SALES_ACCOUNT, XERO_VAT_20, XeroContactSpec, XeroItemSpec } from '../scenarios/xero-fixtures';
import { assertLocalDatabase } from './guard';
import { getXeroAccess, XeroAccess } from './xero-connection';

/**
 * Puts Demo Company (UK) into the known state the Xero scenarios start from
 * (scenarios/xero-fixtures.ts):
 *   - items: deletes every item not in the spec, creates missing ones, and resets changed ones;
 *   - contacts: creates missing ones, resets changed ones, and makes each a customer in Xero;
 *     archives the stray ones listed (Xero can't delete contacts, so its samples stay);
 *   - invoices: deletes or voids the ones earlier runs sent for the scenarios' orders.
 * Running it twice changes nothing. Only ever touches the organisation of the saved docs
 * connection.
 */

const API = 'https://api.xero.com/api.xro/2.0';

type Log = (line: string) => void;

interface XeroItem {
  ItemID: string;
  Code: string;
  Name: string;
  Description?: string;
  IsTrackedAsInventory?: boolean;
  SalesDetails?: { UnitPrice?: number; TaxType?: string; AccountCode?: string };
}

interface XeroAddress {
  AddressType: string;
  AddressLine1?: string;
  City?: string;
  PostalCode?: string;
}

interface XeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  AccountNumber?: string;
  ContactStatus?: string;
  IsCustomer?: boolean;
  Addresses?: XeroAddress[];
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Reference?: string;
  Status: string;
  AmountPaid?: number;
}

export interface XeroDataSpec {
  items: XeroItemSpec[];
  contacts: XeroContactSpec[];
  /** Names of contacts that aren't ours or Xero's samples, to archive. */
  archiveContacts: string[];
  /** References (order numbers) of sales invoices to delete or void. */
  invoiceReferences: string[];
}

export async function resetXeroData(prisma: PrismaClient, spec: XeroDataSpec = XERO_DATA, log: Log = () => {}): Promise<void> {
  assertLocalDatabase();
  const xero = await xeroApi(prisma);
  const changes =
    (await resetItems(xero, spec.items, log)) +
    (await resetContacts(xero, spec.contacts, log)) +
    (await archiveContacts(xero, spec.archiveContacts, log)) +
    (await removeOldInvoices(xero, spec.invoiceReferences, log));
  log(changes === 0 ? 'Xero data already as expected.' : `Xero data reset (${changes} change${changes === 1 ? '' : 's'}).`);
}

async function resetItems(xero: XeroApi, wanted: XeroItemSpec[], log: Log): Promise<number> {
  const existing = (await xero.get<{ Items: XeroItem[] }>('/Items')).Items;
  const wantedCodes = new Set(wanted.map((i) => i.code));
  let changes = 0;

  // Xero refuses to delete an item with stock movements (its sample T-shirts); those stay.
  const kept: string[] = [];
  for (const item of existing.filter((i) => !wantedCodes.has(i.Code))) {
    try {
      await xero.delete(`/Items/${item.ItemID}`);
      log(`  deleted item ${item.Code} ${item.Name}`);
      changes += 1;
    } catch (e) {
      const message = (e as Error).message;
      if (!message.includes('associated with inventory transactions')) log(`  couldn't delete item ${item.Code} ${item.Name}: ${message}`);
      else kept.push(item.Code);
    }
  }
  if (kept.length) log(`  kept ${kept.join(', ')}: Xero won't delete items with stock movements`);

  const toWrite: Array<Record<string, unknown>> = [];
  for (const spec of wanted) {
    const found = existing.find((i) => i.Code === spec.code);
    const body = itemBody(spec);
    if (!found) {
      toWrite.push(body);
      log(`  creating item ${spec.code} ${spec.name}`);
    } else if (!itemMatches(found, spec)) {
      toWrite.push({ ...body, ItemID: found.ItemID });
      log(`  resetting item ${spec.code} ${spec.name}`);
    }
  }
  if (toWrite.length) await xero.post('/Items', { Items: toWrite });
  return changes + toWrite.length;
}

function itemBody(spec: XeroItemSpec): Record<string, unknown> {
  return {
    Code: spec.code,
    Name: spec.name,
    Description: spec.description ?? spec.name,
    IsSold: true,
    SalesDetails: { UnitPrice: spec.unitPrice, TaxType: spec.taxType ?? XERO_VAT_20, AccountCode: spec.accountCode ?? XERO_SALES_ACCOUNT },
  };
}

function itemMatches(found: XeroItem, spec: XeroItemSpec): boolean {
  const sales = found.SalesDetails ?? {};
  return (
    found.Name === spec.name &&
    (found.Description ?? '') === (spec.description ?? spec.name) &&
    Number(sales.UnitPrice ?? NaN) === spec.unitPrice &&
    sales.TaxType === (spec.taxType ?? XERO_VAT_20) &&
    sales.AccountCode === (spec.accountCode ?? XERO_SALES_ACCOUNT)
  );
}

async function resetContacts(xero: XeroApi, wanted: XeroContactSpec[], log: Log): Promise<number> {
  if (!wanted.length) return 0;
  const existing = (await xero.get<{ Contacts: XeroContact[] }>('/Contacts?includeArchived=true')).Contacts;
  const toWrite: Array<Record<string, unknown>> = [];
  for (const spec of wanted) {
    const found = existing.find((c) => c.Name === spec.name);
    if (!found) {
      toWrite.push(contactBody(spec));
      log(`  creating contact ${spec.name}`);
    } else if (!contactMatches(found, spec)) {
      toWrite.push({ ...contactBody(spec), ContactID: found.ContactID });
      log(`  resetting contact ${spec.name}`);
    }
  }
  const written = toWrite.length ? (await xero.post<{ Contacts: XeroContact[] }>('/Contacts', { Contacts: toWrite })).Contacts : [];

  // Stocdup only offers a contact for import once Xero calls it a customer, and Xero decides
  // that itself: a contact becomes a customer when it has a sales invoice. A draft invoice,
  // deleted straight away, is enough, and leaves nothing behind.
  let changes = toWrite.length;
  const contacts = [...written, ...existing.filter((c) => !written.some((w) => w.ContactID === c.ContactID))];
  for (const spec of wanted) {
    const contact = contacts.find((c) => c.Name === spec.name);
    if (!contact || contact.IsCustomer) continue;
    const draft = await xero.post<{ Invoices: Array<{ InvoiceID: string }> }>('/Invoices', {
      Invoices: [
        {
          Type: 'ACCREC',
          Contact: { ContactID: contact.ContactID },
          Status: 'DRAFT',
          LineItems: [{ Description: 'Makes this contact a customer', Quantity: 1, UnitAmount: 0, AccountCode: XERO_SALES_ACCOUNT }],
        },
      ],
    });
    await xero.post('/Invoices', { Invoices: [{ InvoiceID: draft.Invoices[0].InvoiceID, Status: 'DELETED' }] });
    log(`  made ${spec.name} a customer in Xero`);
    changes += 1;
  }
  return changes;
}

/** Archives every active contact with one of these names (Xero can't delete contacts). */
async function archiveContacts(xero: XeroApi, names: string[], log: Log): Promise<number> {
  if (!names.length) return 0;
  const contacts = (await xero.get<{ Contacts: XeroContact[] }>('/Contacts')).Contacts.filter((c) => names.includes(c.Name));
  if (!contacts.length) return 0;
  // Xero accepts the request for every contact, and even answers ARCHIVED, but quietly keeps
  // some active (the signed-in user's own contact), so the result is read back afresh.
  await xero.post('/Contacts', { Contacts: contacts.map((c) => ({ ContactID: c.ContactID, ContactStatus: 'ARCHIVED' })) });
  const ids = contacts.map((c) => c.ContactID).join(',');
  const result = (await xero.get<{ Contacts: XeroContact[] }>(`/Contacts?includeArchived=true&IDs=${ids}`)).Contacts;
  const archived = result.filter((c) => c.ContactStatus === 'ARCHIVED');
  for (const c of archived) log(`  archived contact ${c.Name}`);
  const kept = result.filter((c) => c.ContactStatus !== 'ARCHIVED').map((c) => c.Name);
  if (kept.length) log(`  kept ${kept.join(', ')}: Xero won't archive ${kept.length === 1 ? 'it' : 'them'}`);
  return archived.length;
}

function contactBody(spec: XeroContactSpec): Record<string, unknown> {
  const address = { AddressLine1: spec.address.line1, City: spec.address.city, PostalCode: spec.address.postcode, Country: 'United Kingdom' };
  return {
    Name: spec.name,
    EmailAddress: spec.email ?? '',
    AccountNumber: spec.accountNumber ?? '',
    ContactStatus: 'ACTIVE',
    Addresses: [
      { AddressType: 'POBOX', ...address },
      { AddressType: 'STREET', ...address },
    ],
  };
}

function contactMatches(found: XeroContact, spec: XeroContactSpec): boolean {
  const street = found.Addresses?.find((a) => a.AddressType === 'STREET');
  const pobox = found.Addresses?.find((a) => a.AddressType === 'POBOX');
  const sameAddress = (a?: XeroAddress) =>
    a?.AddressLine1 === spec.address.line1 && a?.City === spec.address.city && a?.PostalCode === spec.address.postcode;
  return (
    found.ContactStatus === 'ACTIVE' &&
    (found.EmailAddress ?? '') === (spec.email ?? '') &&
    (found.AccountNumber ?? '') === (spec.accountNumber ?? '') &&
    sameAddress(street) &&
    sameAddress(pobox)
  );
}

/**
 * Deletes (drafts) or voids (approved) the sales invoices earlier runs sent for the Xero
 * scenarios' orders, so the next export creates a fresh one instead of reusing an old one.
 * A paid invoice can't be voided; that is reported, and the run would show the old invoice.
 */
async function removeOldInvoices(xero: XeroApi, references: string[], log: Log): Promise<number> {
  if (!references.length) return 0;
  const where = `Type=="ACCREC" AND (${references.map((r) => `Reference=="${r}"`).join(' OR ')})`;
  const invoices = (
    await xero.get<{ Invoices: XeroInvoice[] }>(`/Invoices?where=${encodeURIComponent(where)}`)
  ).Invoices.filter((i) => i.Status !== 'DELETED' && i.Status !== 'VOIDED');
  let changes = 0;
  for (const invoice of invoices) {
    if (invoice.Status === 'PAID' || (invoice.AmountPaid ?? 0) > 0) {
      log(`  couldn't remove invoice ${invoice.InvoiceNumber} (${invoice.Reference}): it has payments`);
      continue;
    }
    const status = invoice.Status === 'AUTHORISED' ? 'VOIDED' : 'DELETED';
    await xero.post('/Invoices', { Invoices: [{ InvoiceID: invoice.InvoiceID, Status: status }] });
    log(`  ${status === 'VOIDED' ? 'voided' : 'deleted'} invoice ${invoice.InvoiceNumber} (${invoice.Reference})`);
    changes += 1;
  }
  return changes;
}

/** The Xero API for the docs organisation, with a working token. */
export async function xeroApi(prisma: PrismaClient): Promise<XeroApi> {
  assertLocalDatabase();
  return new XeroApi(await getXeroAccess(prisma));
}

export class XeroApi {
  constructor(private readonly access: XeroAccess) {}

  get<T>(path: string): Promise<T> {
    return this.call<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.call<T>('POST', path, body);
  }

  delete(path: string): Promise<unknown> {
    return this.call('DELETE', path);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.access.accessToken}`,
        'xero-tenant-id': this.access.tenantId,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Xero ${method} ${path.split('?')[0]} failed (${response.status}): ${describeXeroError(text)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

function describeXeroError(text: string): string {
  try {
    const body = JSON.parse(text) as { Message?: string; Detail?: string; Elements?: Array<{ ValidationErrors?: Array<{ Message: string }> }> };
    const validation = body.Elements?.flatMap((e) => e.ValidationErrors ?? []).map((v) => v.Message) ?? [];
    return [body.Message ?? body.Detail, ...validation].filter(Boolean).join('; ') || text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}
