---
status: draft
persona: distributor-owner
section: integrations/xero/products
order: 1
related: [match-tax-types-to-xero, import-product-from-xero, link-product-from-its-record]
---
# Match your products to Xero

## Goal
Link the products you sell in Stocdup to the same items in Xero, by confirming the matches
Stocdup suggests and matching the rest yourself.

## Concept
When a product is linked to a Xero item, invoice lines for it carry that item's code and
its sales account. An unlinked product is still invoiced, described by its name and SKU.
Either way the price on the invoice is always Stocdup's, never Xero's. Each sync, Stocdup
suggests a match when a Xero item's code matches a product's SKU (exactly, or ignoring
case and separators) or when the names match closely. It never links anything on its
own, because similar codes can be different products, sizes or vintages, so items with no
suggestion are matched by hand.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Château Belmont Rouge 2021 (SKU WINE-001) and Rioja Crianza 2020 exist, neither linked
- The Xero item WINE-001 Chateau Belmont Rouge 2021 is suggested for Château Belmont
  Rouge 2021; the Xero item HR-RIOJA House Red - Rioja has no suggestion
- Standard VAT is linked to 20% (VAT on Income), the rate on both Xero items

## Steps
1. Open the synced Xero data and go to Products
2. Find the Xero item Chateau Belmont Rouge 2021 and check its suggested product
3. Confirm the match
4. Find the Xero item House Red - Rioja
5. Match it to the existing product Rioja Crianza 2020
   Note: if the Xero item's tax rate is linked to a different tax type from the
   product's, Stocdup asks before changing the product's tax type.

## Done when
On the Products tab, Chateau Belmont Rouge 2021 and House Red - Rioja both show as linked,
to Château Belmont Rouge 2021 and Rioja Crianza 2020.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: a link can be undone with Unlink, and each product's Integrations tab shows
  its link too (link link-product-from-its-record)
- Mention: Conflict means two Xero items are suggested for the same product; only one can
  be linked
