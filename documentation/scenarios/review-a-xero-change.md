---
status: draft
persona: distributor-owner
section: integrations/xero/products
order: 5
related: [link-product-from-its-record, sync-with-xero]
---
# Review a change made in Xero

## Goal
Check a product whose linked Xero item has changed, and mark the change as reviewed.

## Concept
Stocdup sets your prices; Xero never changes them. When a linked item's sales price or
tax rate changes in Xero, the next sync marks the product "Changed in Xero" and you get a
notification, so you can decide whether Stocdup should change too. The product's
Integrations tab shows what Xero holds now. Acknowledging clears the mark without
changing anything; if Stocdup's price should follow, change it on the product.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Marlborough Sauvignon Blanc 2023 (£13.75) is linked to the Xero item WINE-005
- Since then the item's sales price in Xero has gone up to £14.25, and a sync has seen it

## Steps
1. Open Marlborough Sauvignon Blanc 2023 and go to its Integrations tab
2. Compare Xero's sale price with the product's own price
3. Acknowledge the change

## Done when
Marlborough Sauvignon Blanc 2023 no longer shows Changed in Xero, and its price is still
£13.75.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: changed records are also flagged on the Xero page's Products tab
- Mention: Stocdup's price stays as it is unless you change it

## Open questions
- Does a contact change get the same treatment on a customer? (The code tracks changes on
  contacts too; this page covers products only.)
