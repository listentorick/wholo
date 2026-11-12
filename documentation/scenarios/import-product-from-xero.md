---
status: draft
persona: distributor-owner
section: integrations/xero/products
order: 2
related: [match-products-to-xero, bulk-import-products-from-xero, match-tax-types-to-xero]
---
# Import a product from Xero

## Goal
Create a new Stocdup product from an item in Xero, checking its name, SKU and price as you
import it.

## Concept
An item that's in Xero but not yet in Stocdup can be imported as a new product, already
linked to its Xero item. The name, code and sales price come from Xero, and you can change
them before importing. The product starts as a Draft: customers can't see it until you
finish setting it up and make it active. If the item's Xero tax rate is linked to a
Stocdup tax type, the product gets that tax type; if not, it has none until you set one.
From then on the product's details and its price are Stocdup's.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced, with no products
- The Xero item WINE-101 Côtes du Rhône Villages 2022, sales price £11.50, is ready to
  import
- Standard VAT is linked to 20% (VAT on Income)

## Steps
1. Open the synced Xero data and go to Products
2. Find the Xero item Côtes du Rhône Villages 2022
3. Import it as a new product, keeping the name, SKU WINE-101 and price £11.50
   Note: if a product already has that SKU, Stocdup says so; match it instead.
4. Open the new product

## Done when
The product Côtes du Rhône Villages 2022 (SKU WINE-101, £11.50) is a Draft with tax type
Standard VAT, and its Xero item shows as linked to it.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: only items Xero marks as sold can be imported
- Mention: to import many items at once, see bulk-import-products-from-xero

## Open questions
- Is the price rounded to two decimal places on import? (The earlier draft said so; not
  re-checked.)
