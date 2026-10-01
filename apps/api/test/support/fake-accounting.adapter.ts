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
  private readonly invoices = new Map<string, AccountingExternalInvoiceStatus>();
  private readonly resultsByKey = new Map<string, AccountingInvoiceResult>();
  private sequence = 0;

  async buildAuthorizationUrl(state: string): Promise<string> {
    return `https://fake-books.test/consent?state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(_callbackUrl: string, _expectedState: string): Promise<AccountingTokenSet> {
    return FakeAccountingAdapter.tokenSet();
  }

  async listAvailableOrganisations(_tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]> {
    return [{ externalId: 'fake-org-1', name: 'Fake Books Organisation' }];
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

  async createInvoice(
    _tokenSet: AccountingTokenSet,
    _externalOrganisationId: string,
    request: AccountingInvoiceRequest,
    idempotencyKey: string,
  ): Promise<AccountingInvoiceResult> {
    const replay = this.resultsByKey.get(idempotencyKey);
    if (replay) return replay; // the port's idempotency obligation

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
    this.resultsByKey.set(idempotencyKey, result);
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
    return result;
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
