---
status: draft
persona: distributor-owner
section: integrations/xero/setting-up
order: 1
seed: dev-seed
related: [match-tax-types-to-xero, match-products-to-xero, import-product-from-xero]
---
# Connect Xero

## Goal
Connect your Xero organisation to Stocdup and bring in its contacts, products and tax rates
so you can review them.

## Concept
Xero keeps your invoices and payments, and Stocdup stays in charge of your prices. Once
Xero is connected, each order you accept is sent to Xero as an invoice for that customer,
at the price in Stocdup. Stocdup also reads Xero's contacts, products and tax rates. A
sync brings them in for you to review, and nothing changes in Stocdup until you link or
import them. Only an Owner can connect or disconnect Xero.

## Starting data
- Vine & Co has no Xero connection
- The person running it can sign in to Xero and has access to the Demo Company (UK)
  organisation

## Steps
1. Open Integrations
2. Start connecting Xero
3. Sign in to Xero and allow Stocdup access to Demo Company (UK)
   Note: Xero's own pages ask which organisation to connect; choose one.
4. Open the synced Xero data
5. Sync with Xero for the first time
6. Review what the sync found

## Done when
Integrations shows Xero as Connected to Demo Company (UK), and the Xero page lists its
contacts, products and tax types on their tabs.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: disconnecting keeps your links to contacts, products and tax types if you
  reconnect to the same Xero organisation
- Mention: after the first sync, Stocdup keeps syncing on a schedule; "Sync with Xero"
  syncs straight away
- Explain: link tax types and products next (link match-tax-types-to-xero and
  match-products-to-xero)

## Open questions
- Vine & Co is already connected to Demo Company (UK) locally, so the run needs a
  disconnect first; reconnecting the same organisation keeps the existing links.
- Connecting needs the HTTPS entry point (https://admin.localhost:8443) and a person to sign
  in to Xero; the run can't do the Xero sign-in itself. Should the page show Xero's
  organisation-choice screen (never its sign-in page)?
