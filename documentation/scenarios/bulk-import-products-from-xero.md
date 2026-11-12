---
status: draft
persona: distributor-owner
section: integrations/xero/products
order: 3
related: [import-product-from-xero, match-products-to-xero, bulk-import-customers-from-xero]
---
# Import several products from Xero at once

## Goal
Bring a batch of Xero items into Stocdup in one go, and check the import report for what
happened to each.

## Concept
Instead of importing items one at a time, you can select several items on the Products tab
and import them together. The import runs in the background and you're notified when it's
done. Each item is handled on its own: an item ready to import becomes a new Draft product
with Xero's name, code and price. An item with a suggested match is linked to that product
only if you tick "Honour suggested matches"; otherwise it's imported as a new product
alongside the one it matched. Items that can't be imported are skipped, and one item
failing doesn't stop the rest. The Bulk import report lists every item and its outcome.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced, with no products
- These Xero items are ready to import: WINE-102 Grüner Veltliner 2023, WINE-103 Malbec
  Reserva 2021, WINE-104 Picpoul de Pinet 2023
- Standard VAT is linked to 20% (VAT on Income)

## Steps
1. Open the synced Xero data and go to Products
2. Select Grüner Veltliner 2023, Malbec Reserva 2021 and Picpoul de Pinet 2023
3. Import them
4. Open the import report when it's done

## Done when
The Bulk import report shows all three items as Imported, and the three products are on
the Products page as Drafts.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: imported products start as Drafts and need setting up before customers can see
  them
- Mention: tick "Honour suggested matches" when the selection includes items with a
  suggested match, so they're linked rather than duplicated

## Open questions
- How the report is reached (the notification or a link on the page) is unconfirmed; the
  run will settle it.
