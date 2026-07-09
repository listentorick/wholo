import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address, Contact, XeroClient } from 'xero-node';
import {
  AccountingConnectionAdapter,
  AccountingExternalContact,
  AccountingExternalOrganisation,
  AccountingTokenSet,
} from './accounting-connection-adapter.interface';

// Xero requests all scopes up front (including contacts/settings, unused
// until Phases 2-3) because Xero scopes cannot be silently expanded after
// the distributor has consented — asking now avoids a second consent round trip.
const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.contacts',
  'accounting.settings',
  'offline_access',
];

@Injectable()
export class XeroAccountingAdapter implements AccountingConnectionAdapter {
  private readonly logger = new Logger(XeroAccountingAdapter.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.getOrThrow<string>('XERO_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('XERO_CLIENT_SECRET');
    // This is apps/admin-api's public callback URL, not a route on this
    // service — Xero's redirect lands on admin-api (the public origin),
    // which calls this service's internal /accounting/xero/callback
    // endpoint server-to-server. xero-node still needs this value verbatim
    // for the token-exchange request regardless of who received the redirect.
    this.redirectUri = config.getOrThrow<string>('XERO_REDIRECT_URI');
  }

  // xero-node's XeroClient pins `state` at construction (it's checked
  // internally on the callback), so a fresh client is built per state value.
  private buildClient(state?: string): XeroClient {
    return new XeroClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUris: [this.redirectUri],
      scopes: XERO_SCOPES,
      state,
    });
  }

  async buildAuthorizationUrl(state: string): Promise<string> {
    const client = this.buildClient(state);
    return client.buildConsentUrl();
  }

  async exchangeCodeForToken(callbackUrl: string, expectedState: string): Promise<AccountingTokenSet> {
    const client = this.buildClient(expectedState);
    const tokenSet = await client.apiCallback(callbackUrl);
    return this.toAccountingTokenSet(tokenSet);
  }

  async listAvailableOrganisations(tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    const tenants = await client.updateTenants(false);
    return tenants.map((tenant: { tenantId: string; tenantName: string }) => ({
      externalId: tenant.tenantId,
      name: tenant.tenantName,
    }));
  }

  async refreshAccessToken(tokenSet: AccountingTokenSet): Promise<AccountingTokenSet> {
    const client = this.buildClient();
    const refreshed = await client.refreshWithRefreshToken(this.clientId, this.clientSecret, tokenSet.refreshToken);
    return this.toAccountingTokenSet(refreshed);
  }

  async listContacts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    modifiedSince?: Date,
  ): Promise<AccountingExternalContact[]> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    const contacts: Contact[] = [];
    let page = 1;
    // xero-node paginates at 100 contacts/page; loop until a short page ends it.
    for (;;) {
      const { body } = await client.accountingApi.getContacts(
        externalOrganisationId,
        modifiedSince,
        undefined, // where
        undefined, // order
        undefined, // iDs
        page,
        true, // includeArchived — Archived is a status this feature surfaces
      );
      const batch = body.contacts ?? [];
      contacts.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
    return contacts.map((c) => this.toAccountingExternalContact(c));
  }

  private toAccountingExternalContact(contact: Contact): AccountingExternalContact {
    // Xero has no distinct "billing address" type — STREET is the closest
    // equivalent to a postal/billing address; POBOX is the fallback.
    const address =
      contact.addresses?.find((a) => a.addressType === Address.AddressTypeEnum.STREET) ?? contact.addresses?.[0];
    return {
      externalId: contact.contactID ?? '',
      code: contact.contactNumber || undefined,
      accountNumber: contact.accountNumber || undefined,
      displayName: contact.name ?? '',
      email: contact.emailAddress || undefined,
      billingLine1: address?.addressLine1 || undefined,
      billingLine2: address?.addressLine2 || undefined,
      billingCity: address?.city || undefined,
      billingState: address?.region || undefined,
      billingPostcode: address?.postalCode || undefined,
      billingCountry: address?.country || undefined,
      isCustomer: !!contact.isCustomer,
      isSupplier: !!contact.isSupplier,
      isArchived: contact.contactStatus === Contact.ContactStatusEnum.ARCHIVED,
      updatedAt: contact.updatedDateUTC ? new Date(contact.updatedDateUTC).toISOString() : undefined,
      raw: contact,
    };
  }

  private toAccountingTokenSet(tokenSet: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    id_token?: string;
    scope?: string;
  }): AccountingTokenSet {
    if (!tokenSet.access_token || !tokenSet.refresh_token || !tokenSet.expires_at) {
      throw new Error('Xero token exchange did not return a complete token set');
    }
    return {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      expiresAt: new Date(tokenSet.expires_at * 1000).toISOString(),
      idToken: tokenSet.id_token,
      scope: tokenSet.scope ?? XERO_SCOPES.join(' '),
    };
  }

  private toXeroTokenSetParams(tokenSet: AccountingTokenSet) {
    return {
      access_token: tokenSet.accessToken,
      refresh_token: tokenSet.refreshToken,
      expires_at: Math.floor(new Date(tokenSet.expiresAt).getTime() / 1000),
      id_token: tokenSet.idToken,
      scope: tokenSet.scope,
    };
  }
}

export { XERO_SCOPES };
