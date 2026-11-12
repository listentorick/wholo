---
status: draft
persona: distributor-owner
section: integrations/xero/products
order: 4
related: [match-products-to-xero, review-a-xero-change]
---
# Link a product to Xero from the product

## Goal
Link a product to its Xero item from the product's own page, and see the link there.

## Concept
Each product has an Integrations tab showing its link to Xero: the linked item's code,
sale price and tax rate, when it was linked and by whom, and when Stocdup last synced. A
product that isn't linked shows the item Stocdup suggests, if any, and lets you search
Xero's items yourself. An unlinked product is still invoiced, described by its name and
SKU; linking it puts the Xero item's code on invoice lines.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Barolo Riserva 2019 (SKU WINE-004) isn't linked; Stocdup suggests the Xero item
  Barolo Riserva 2019 (code BAR-RIS-19) for it, by name
- Standard VAT is linked to 20% (VAT on Income)

## Steps
1. Open the product Barolo Riserva 2019 and go to its Integrations tab
2. Check the suggested Xero item
3. Link the product to it

## Done when
Barolo Riserva 2019's Integrations tab shows the linked item Barolo Riserva 2019, code
BAR-RIS-19, linked by James Vine.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: with no suggestion, search Xero's items by name or code from the same tab
- Mention: Unlink removes the link; the tab keeps a link history
