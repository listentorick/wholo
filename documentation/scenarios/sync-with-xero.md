---
status: draft
persona: distributor-owner
section: integrations/xero/setting-up
order: 2
related: [match-tax-types-to-xero, match-products-to-xero, match-customers-to-xero]
---
# Sync with Xero for the first time

## Goal
Bring your Xero contacts, products and tax rates into Stocdup, and see what the sync
found, ready to link or import.

## Concept
Stocdup keeps a copy of your Xero contacts, items and tax rates so you can link them to
your customers, products and tax types, or create new ones from them. A sync refreshes
that copy and suggests matches; it never changes your customers, products or prices, and
nothing is linked until you confirm it. After the first sync, Stocdup syncs again on its
own: contacts and products every 30 minutes, tax rates every 6 hours. Sync with Xero
syncs everything straight away.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has never synced

## Steps
1. Open Integrations and go to your Xero connection
2. Sync with Xero
3. Follow the sync until it finishes
4. Look through Contacts, Products and Tax types

## Done when
The Xero page shows when it last synced, and its Contacts, Products and Tax types tabs
list what came across from Demo Company (UK).

## Doc notes
- Audience: distributor owner, no technical background
- Mention: next, link your tax types, then products, then customers (link
  match-tax-types-to-xero, match-products-to-xero, match-customers-to-xero)
- Mention: Changed means a linked record changed in Xero since the last sync (link
  review-a-xero-change)

## Open questions
- Connecting Xero isn't covered yet (connect-xero is parked), so this page starts from a
  connected, never-synced account.
