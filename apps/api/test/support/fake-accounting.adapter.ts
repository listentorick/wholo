import type {
  AccountingConnectionAdapter,
  AccountingExternalContact,
  AccountingExternalInvoiceStatus,
  AccountingExternalOrganisation,
  AccountingExternalProduct,
  AccountingExternalTaxRate,
  AccountingFetchResult,
  AccountingInvoiceRequest,
  AccountingInvoiceResult,
  AccountingTokenSet,
} from '../../src/accounting/adapters/accounting-connection-adapter.interface';
import { AccountingProviderError } from '../../src/accounting/adapters/accounting-provider.error';

// How the next createInvoice call goes wrong (test control):
//   created-then-unknown — the provider creates the invoice, but the caller
//                          gets no answer (timeout / dropped connection / 5xx);
//   rejected             — the provider refuses it; nothing is created;
//   not-sent             — the request never reaches the provider.
export type FakeCreateFailure = 'created-then-unknown' | 'rejected' | 'not-sent';

const money = (n: number) => n.toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);

// A second, in-memory accounting provider, written only against the
// provider-neutral port. It exists to keep the framework honest:
//   - it must compile against AccountingConnectionAdapter alone, so any
//     provider-specific type creeping into the port breaks this file;
//   - test/accounting-framework.integration-spec.ts drives sync, invoice
//     export and invoice status sync through it — if a real second provider
//     would need framework changes, that spec is where it shows.
// It behaves like a provider without incremental pulls (nextCursor is always
// null), which the framework must handle too.
export class FakeAccountingAdapter implements AccountingConnectionAdapter {
  readonly displayName = 'Fake Books';

  // What the "provider" holds — tests set these up directly.
  contacts: AccountingExternalContact[] = [];
  products: AccountingExternalProduct[] = [];
  taxRates: AccountingExternalTaxRate[] = [];
  readonly createdInvoices: Array<{ request: AccountingInvoiceRequest; idempotencyKey: string }> = [];
  // Failures for the coming createInvoice calls, consumed in order.
  readonly failNextCreates: FakeCreateFailure[] = [];
  private readonly invoices = new Map<string, AccountingExternalInvoiceStatus>();
  // Every invoice the "provider" holds, by reference — what a duplicate would
  // show up in.
  private readonly ledger: Array<{ reference: string; voided: boolean; result: AccountingInvoiceResult }> = [];
  // Like a real provider, idempotency keys are remembered only for a while
  // (Xero: 6 minutes) — tests call expireIdempotencyKeys() to let time pass.
  private readonly resultsByKey = new Map<string, { request: string; result: AccountingInvoiceResult }>();
  private sequence = 0;

  async buildAuthorizationUrl(state: string): Promise<string> {
    return `https://fake-books.test/consent?state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(_callbackUrl: string, _expectedState: string): Promise<AccountingTokenSet> {
    return FakeAccountingAdapter.tokenSet();
  }

  // Which company the next connect lands in — tests switch it to model
  // connecting a different organisation.
  organisations: AccountingExternalOrganisation[] = [{ externalId: 'fake-org-1', name: 'Fake Books Organisation' }];

  async listAvailableOrganisations(_tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]> {
    return this.organisations;
  }

  async refreshAccessToken(_tokenSet: AccountingTokenSet): Promise<AccountingTokenSet> {
    return FakeAccountingAdapter.tokenSet();
  }

  async listContacts(): Promise<AccountingFetchResult<AccountingExternalContact>> {
    return { records: this.contacts, nextCursor: null };
  }

  async listProducts(): Promise<AccountingFetchResult<AccountingExternalProduct>> {
    return { records: this.products, nextCursor: null };
  }

  async listTaxRates(): Promise<AccountingExternalTaxRate[]> {
    return this.taxRates;
  }

  hasInvoiceCreationScope(_grantedScopes: string): boolean {
    return true;
  }

  hasInvoiceReadScope(_grantedScopes: string): boolean {
    return true;
  }

  async listInvoiceStatuses(): Promise<AccountingFetchResult<AccountingExternalInvoiceStatus>> {
    return { records: [...this.invoices.values()], nextCursor: null };
  }

  async findInvoiceByReference(
    _tokenSet: AccountingTokenSet,
    _externalOrganisationId: string,
    reference: string,
  ): Promise<AccountingInvoiceResult | null> {
    return this.liveInvoices(reference)[0] ?? null;
  }

  async createInvoice(
    _tokenSet: AccountingTokenSet,
    _externalOrganisationId: string,
    request: AccountingInvoiceRequest,
    idempotencyKey: string,
  ): Promise<AccountingInvoiceResult> {
    const failure = this.failNextCreates.shift();
    if (failure === 'not-sent') {
      throw new AccountingProviderError('Fake Books is rate limiting', true, undefined, 'HTTP_429', { statusCode: 429 });
    }
    if (failure === 'rejected') {
      throw new AccountingProviderError('Fake Books rejected the invoice', false, undefined, 'HTTP_400', { statusCode: 400 });
    }

    const replay = this.resultsByKey.get(idempotencyKey);
    if (replay) {
      // A remembered key replays its result — and, like Xero, refuses to be
      // reused for a different request.
      if (replay.request !== JSON.stringify(request)) {
        throw new AccountingProviderError('Fake Books: idempotency key reused with a different request', false);
      }
      return replay.result;
    }

    this.sequence += 1;
    const externalInvoiceId = `fake-inv-${this.sequence}`;
    const total = request.lines.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice), 0);
    const result: AccountingInvoiceResult = {
      externalInvoiceId,
      externalInvoiceNumber: `FB-${String(this.sequence).padStart(4, '0')}`,
      externalInvoiceStatus: 'OPEN',
      raw: {},
    };
    this.createdInvoices.push({ request, idempotencyKey });
    this.resultsByKey.set(idempotencyKey, { request: JSON.stringify(request), result });
    this.ledger.push({ reference: request.reference, voided: false, result });
    this.invoices.set(externalInvoiceId, {
      externalInvoiceId,
      externalInvoiceNumber: result.externalInvoiceNumber,
      state: 'AWAITING_PAYMENT',
      rawStatus: 'OPEN',
      currency: request.currency,
      total: money(total),
      amountPaid: money(0),
      amountCredited: money(0),
      amountDue: money(total),
      issueDate: request.issueDate,
      dueDate: request.issueDate,
      fullyPaidOn: null,
      providerUpdatedAt: new Date(),
    });
    if (failure === 'created-then-unknown') {
      throw new AccountingProviderError('Fake Books did not respond', true, undefined, 'NETWORK', { outcomeUnknown: true });
    }
    return result;
  }

  // Test control: the live (not voided) invoices the provider holds for a
  // reference, oldest first. More than one is a duplicate.
  liveInvoices(reference: string): AccountingInvoiceResult[] {
    return this.ledger.filter((entry) => entry.reference === reference && !entry.voided).map((entry) => entry.result);
  }

  // Test control: the distributor voids an invoice in the provider.
  voidInvoice(externalInvoiceId: string): void {
    const entry = this.ledger.find((e) => e.result.externalInvoiceId === externalInvoiceId);
    if (!entry) throw new Error(`No fake invoice ${externalInvoiceId}`);
    entry.voided = true;
  }

  // Test control: enough time passes for the provider to forget every
  // idempotency key it has seen.
  expireIdempotencyKeys(): void {
    this.resultsByKey.clear();
  }

  // Test control: an empty provider again.
  reset(): void {
    this.createdInvoices.length = 0;
    this.failNextCreates.length = 0;
    this.invoices.clear();
    this.ledger.length = 0;
    this.resultsByKey.clear();
    this.sequence = 0;
  }

  // Test control: the customer pays (part of) an invoice in the provider.
  recordPayment(externalInvoiceId: string, amount: number): void {
    const invoice = this.invoices.get(externalInvoiceId);
    if (!invoice) throw new Error(`No fake invoice ${externalInvoiceId}`);
    const paid = Number(invoice.amountPaid) + amount;
    const due = Math.max(0, Number(invoice.total) - paid);
    this.invoices.set(externalInvoiceId, {
      ...invoice,
      state: due === 0 ? 'PAID' : 'AWAITING_PAYMENT',
      rawStatus: due === 0 ? 'SETTLED' : 'OPEN',
      amountPaid: money(paid),
      amountDue: money(due),
      fullyPaidOn: due === 0 ? today() : null,
      providerUpdatedAt: new Date(Date.now() + 1000),
    });
  }

  static tokenSet(): AccountingTokenSet {
    return {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scope: 'fake.all',
    };
  }
}
