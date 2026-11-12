---
status: draft
persona: distributor-owner
section: integrations/xero/tax-types
order: 1
related: [import-xero-tax-rate, match-products-to-xero, sync-with-xero]
---
# Match your tax types to Xero

## Goal
Link each tax type you use in Stocdup to the matching tax rate in Xero, so invoices carry
the right tax.

## Concept
Every product in Stocdup has a tax type, and each order line keeps it. When an order is
sent to Xero as an invoice, each line uses the Xero tax rate linked to its tax type; a
line whose tax type isn't linked goes without one, and Xero applies its own default.
Stocdup suggests a link only when the names match closely, and tax rate names often
differ ("Standard VAT" in Stocdup, "20% (VAT on Income)" in Xero), so you'll often link
them yourself. Linking tax types first also means products you import from Xero get the
right tax type.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Standard VAT isn't linked to any Xero tax rate, and no link is suggested

## Steps
1. Open the synced Xero data and go to Tax types
2. Find the Xero tax rate 20% (VAT on Income)
3. Match it to the existing tax type Standard VAT
   Note: a tax type can be linked to only one Xero tax rate.

## Done when
On the Tax types tab, 20% (VAT on Income) shows as linked to Standard VAT.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: a suggested match still needs confirming; Stocdup never links anything on its
  own
- Mention: a Xero rate you don't use for sales (for example, VAT on Expenses) can be
  ignored so it stops needing attention
- Mention: a Xero rate with no Stocdup tax type yet can be imported as a new tax type
  (link import-xero-tax-rate)

## Open questions
- "A tax type can be linked to only one Xero tax rate" comes from the two one-active-link
  rules on tax type links; confirm the match dialog says so on the run.
- What an invoice line with an unlinked tax type gets in Xero (Xero's default for the
  account) is from the export code's comments; confirm before publishing.
