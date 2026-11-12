import {
  AccountingContactMatchMethod,
  AccountingContactMatchStatus,
  AccountingProductMatchMethod,
  AccountingProductMatchStatus,
  AccountingTaxTypeMatchMethod,
  AccountingTaxTypeMatchStatus,
  PrismaClient,
} from '@prisma/client';
import { DOCS_DISTRIBUTOR_ID, DOCS_USERS } from './ids';
import { DOCS_XERO_ORGANISATION_ID } from './xero-connection';

/**
 * Links Stocdup records to synced Xero records, as the owner would from Integrations: the
 * same rows src/accounting/accounting-{product,contact,tax-type}.service.ts write.
 *   - If the sync suggested this pair, the suggestion is accepted (the app's "Confirm").
 *   - Otherwise it's a manual match, and any open suggestion for the Xero record is
 *     superseded (the app's "Match to existing").
 * Call these from a Xero scenario's `after` step: the Xero record must have synced first.
 */

const ORG = { distributorId: DOCS_DISTRIBUTOR_ID, accountingOrganisationId: DOCS_XERO_ORGANISATION_ID };
const LINKED_BY = DOCS_USERS.owner.id;

/** Links a product to the Xero item with this code. The product keeps its own tax type: seed
 *  products use Standard VAT, which is what the spec's items carry (20% VAT on Income). */
export async function linkProductToXero(prisma: PrismaClient, productId: string, itemCode: string): Promise<void> {
  const item = await prisma.externalAccountingProduct.findFirst({ where: { ...ORG, externalProductCode: itemCode } });
  if (!item) throw new Error(`No synced Xero item with code ${itemCode}; is it in xero-fixtures.ts?`);
  const suggestion = await prisma.accountingProductMatchSuggestion.findFirst({
    where: { ...ORG, externalProductId: item.id, suggestedProductId: productId, status: AccountingProductMatchStatus.SUGGESTED },
  });
  await prisma.$transaction(async (tx) => {
    await tx.productAccountingMapping.create({
      data: {
        ...ORG,
        productId,
        externalProductId: item.id,
        matchMethod: suggestion?.matchMethod ?? AccountingProductMatchMethod.MANUAL,
        linkedByUserId: LINKED_BY,
      },
    });
    await tx.accountingProductMatchSuggestion.updateMany({
      where: { externalProductId: item.id, status: AccountingProductMatchStatus.SUGGESTED },
      data: { status: AccountingProductMatchStatus.SUPERSEDED },
    });
    if (suggestion) {
      await tx.accountingProductMatchSuggestion.update({
        where: { id: suggestion.id },
        data: { status: AccountingProductMatchStatus.ACCEPTED, reviewedByUserId: LINKED_BY, reviewedAt: new Date() },
      });
    }
  });
}

/** Links a customer (its trade relationship) to the Xero contact with this name. */
export async function linkCustomerToXero(prisma: PrismaClient, tradeRelationshipId: string, contactName: string): Promise<void> {
  const contact = await prisma.externalAccountingContact.findFirst({ where: { ...ORG, displayName: contactName } });
  if (!contact) throw new Error(`No synced Xero contact called ${contactName}; is it in xero-fixtures.ts?`);
  const suggestion = await prisma.accountingContactMatchSuggestion.findFirst({
    where: { ...ORG, externalContactId: contact.id, suggestedTradeRelationshipId: tradeRelationshipId, status: AccountingContactMatchStatus.SUGGESTED },
  });
  await prisma.$transaction(async (tx) => {
    await tx.customerAccountingMapping.create({
      data: {
        ...ORG,
        tradeRelationshipId,
        externalContactId: contact.id,
        matchMethod: suggestion?.matchMethod ?? AccountingContactMatchMethod.MANUAL,
        linkedByUserId: LINKED_BY,
      },
    });
    await tx.accountingContactMatchSuggestion.updateMany({
      where: { externalContactId: contact.id, status: AccountingContactMatchStatus.SUGGESTED },
      data: { status: AccountingContactMatchStatus.SUPERSEDED },
    });
    if (suggestion) {
      await tx.accountingContactMatchSuggestion.update({
        where: { id: suggestion.id },
        data: { status: AccountingContactMatchStatus.ACCEPTED, reviewedByUserId: LINKED_BY, reviewedAt: new Date() },
      });
    }
  });
}

/** Links a tax type to the Xero tax rate with this code (OUTPUT2 is 20% VAT on Income). */
export async function linkTaxTypeToXero(prisma: PrismaClient, taxTypeId: string, xeroTaxType: string): Promise<void> {
  const rate = await prisma.externalAccountingTaxType.findFirst({ where: { ...ORG, taxType: xeroTaxType } });
  if (!rate) throw new Error(`No synced Xero tax rate ${xeroTaxType}.`);
  const suggestion = await prisma.accountingTaxTypeMatchSuggestion.findFirst({
    where: { ...ORG, externalTaxTypeId: rate.id, suggestedTaxTypeId: taxTypeId, status: AccountingTaxTypeMatchStatus.SUGGESTED },
  });
  await prisma.$transaction(async (tx) => {
    await tx.taxTypeAccountingMapping.create({
      data: {
        ...ORG,
        taxTypeId,
        externalTaxTypeId: rate.id,
        matchMethod: suggestion?.matchMethod ?? AccountingTaxTypeMatchMethod.MANUAL,
        linkedByUserId: LINKED_BY,
      },
    });
    await tx.accountingTaxTypeMatchSuggestion.updateMany({
      where: { externalTaxTypeId: rate.id, status: AccountingTaxTypeMatchStatus.SUGGESTED },
      data: { status: AccountingTaxTypeMatchStatus.SUPERSEDED },
    });
    if (suggestion) {
      await tx.accountingTaxTypeMatchSuggestion.update({
        where: { id: suggestion.id },
        data: { status: AccountingTaxTypeMatchStatus.ACCEPTED, reviewedByUserId: LINKED_BY, reviewedAt: new Date() },
      });
    }
  });
}
