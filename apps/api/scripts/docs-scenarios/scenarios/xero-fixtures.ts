// What Demo Company (UK) holds for the Xero scenarios. resetXeroData (lib/xero-data.ts) puts
// Xero back to exactly this before every Xero seed, so a scenario that changes something in
// Xero, or Xero's own reset of the demo company, never leaves the next run in a different state.
//
// Items: every item whose code isn't listed here is deleted, except Xero's sample T-shirts,
// which Xero won't delete (they have stock movements). Contacts: Xero's sample contacts can't
// be deleted either, so they stay; ours have trade-customer names that are easy to pick out.
// Tax rates are Xero's own: OUTPUT2 is 20% (VAT on Income), RROUTPUT is 5% (VAT on Income).
//
// A Stocdup record only gets a suggested match if it exists at the first sync, so which
// suggestions a scenario shows depends on which customers and products its seed adds, not on
// this file: everything here is in Xero for every Xero scenario.

/** Xero's UK tax type code for "20% (VAT on Income)", and its default Sales account. */
export const XERO_VAT_20 = 'OUTPUT2';
export const XERO_SALES_ACCOUNT = '200';

export interface XeroItemSpec {
  code: string;
  name: string;
  description?: string;
  unitPrice: number;
  taxType?: string;
  accountCode?: string;
}

export interface XeroContactSpec {
  name: string;
  email?: string;
  accountNumber?: string;
  /** Used as both the billing (POBOX) and delivery (STREET) address. */
  address: { line1: string; city: string; postcode: string };
}

export const XERO_ITEMS = {
  // Suggested for Château Belmont Rouge 2021 (SKU WINE-001); the name is spelled the way Xero has it.
  chateauBelmont: { code: 'WINE-001', name: 'Chateau Belmont Rouge 2021', unitPrice: 14.5 },
  // A code and name that match no product, for matching by hand (to Rioja Crianza 2020).
  houseRed: { code: 'HR-RIOJA', name: 'House Red - Rioja', unitPrice: 15.5 },
  // Suggested for Barolo Riserva 2019 by its name only (the product's SKU is WINE-004).
  barolo: { code: 'BAR-RIS-19', name: 'Barolo Riserva 2019', unitPrice: 28 },
  // Linked to Marlborough Sauvignon Blanc 2023; review-a-xero-change changes its price in Xero.
  sauvignon: { code: 'WINE-005', name: 'Marlborough Sauvignon Blanc 2023', unitPrice: 13.75 },
  // Linked to Prosecco Extra Dry for the invoice scenario.
  prosecco: { code: 'WINE-007', name: 'Prosecco Extra Dry', unitPrice: 9.99 },
  // Ready to import: no Vine & Co product has these codes.
  cotesDuRhone: { code: 'WINE-101', name: 'Côtes du Rhône Villages 2022', unitPrice: 11.5 },
  gruner: { code: 'WINE-102', name: 'Grüner Veltliner 2023', unitPrice: 12.25 },
  malbec: { code: 'WINE-103', name: 'Malbec Reserva 2021', unitPrice: 13.95 },
  picpoul: { code: 'WINE-104', name: 'Picpoul de Pinet 2023', unitPrice: 10.75 },
} satisfies Record<string, XeroItemSpec>;

/** The price review-a-xero-change sets on the Sauvignon Blanc item in Xero. */
export const XERO_SAUVIGNON_NEW_PRICE = 14.25;

export const XERO_CONTACTS = {
  // Suggested for The Blackbird Restaurant: same email.
  blackbird: { name: 'Blackbird Restaurant Ltd', email: 'orders@blackbird.example', address: { line1: '1 Market Street', city: 'Leeds', postcode: 'LS1 6DT' } },
  // Suggested for The Anchor Inn: same account number.
  anchorInn: { name: 'Anchor Inn Harrogate', accountNumber: 'VC-1002', address: { line1: '14 Kings Road', city: 'Harrogate', postcode: 'HG1 5JX' } },
  // No suggestion: a different trading name, no email or account number. Matched to
  // Riverside Bistro by hand.
  riverside: { name: 'RB Hospitality Ltd', address: { line1: 'PO Box 221', city: 'York', postcode: 'YO1 9WP' } },
  // Suggested for Highfield Golf Club: same name.
  highfield: { name: 'Highfield Golf Club', address: { line1: 'Highfield Lane', city: 'Wakefield', postcode: 'WF2 7PL' } },
  // Linked to Botanica Bar & Kitchen for the invoice scenario.
  botanica: { name: 'Botanica Bar & Kitchen', email: 'manager@botanicabar.example', address: { line1: '22 Call Lane', city: 'Leeds', postcode: 'LS1 6DN' } },
  // Ready to import: no Vine & Co customer has these names or emails.
  crownAndKettle: { name: 'The Crown & Kettle', email: 'orders@crownandkettle.example', address: { line1: '8 Oldham Street', city: 'Manchester', postcode: 'M1 1JQ' } },
  harbourLights: { name: 'Harbour Lights Hotel', email: 'purchasing@harbourlights.example', address: { line1: '3 Quay Street', city: 'Whitby', postcode: 'YO21 3PU' } },
  oliveTree: { name: 'Olive Tree Deli', email: 'hello@olivetreedeli.example', address: { line1: '51 Otley Road', city: 'Leeds', postcode: 'LS6 3AB' } },
  fenwick: { name: 'Fenwick Wine Bar', email: 'bar@fenwickwinebar.example', address: { line1: '19 Grey Street', city: 'Newcastle upon Tyne', postcode: 'NE1 6EE' } },
} satisfies Record<string, XeroContactSpec>;

/**
 * Contacts added to the demo company by hand while testing. Xero can't delete contacts, so
 * they are archived: an archived contact gets no suggested matches and is hidden by the
 * Contacts tab's default filter. "The Blackbird Restaurant" would otherwise be a second
 * suggestion for The Blackbird Restaurant; "Richard Walsh" carries a real email address.
 */
export const XERO_CONTACTS_TO_ARCHIVE = ['The Blackbird Restaurant', 'Richard Walsh', 'Basket Shop', 'Probe Customer Ltd'];

/**
 * Order numbers the Xero scenarios' orders use. Accepting one sends an invoice to Xero with
 * the order number as its reference, and Stocdup reuses a live Xero invoice with the same
 * reference rather than creating another (ADR-073), so resetXeroData deletes or voids these
 * before every Xero seed.
 */
export const XERO_ORDER_NUMBERS = { botanica: 'ORD-2026-60001' } as const;

export const XERO_DATA = {
  items: Object.values(XERO_ITEMS) as XeroItemSpec[],
  contacts: Object.values(XERO_CONTACTS) as XeroContactSpec[],
  archiveContacts: XERO_CONTACTS_TO_ARCHIVE,
  invoiceReferences: Object.values(XERO_ORDER_NUMBERS) as string[],
};
