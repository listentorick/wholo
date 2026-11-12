---
status: draft
persona: distributor-owner
section: integrations/xero/tax-types
order: 2
related: [match-tax-types-to-xero, add-tax-type]
---
# Create a tax type from a Xero tax rate

## Goal
Add a tax type to Stocdup from a tax rate you already have in Xero, linked to it from the
start.

## Concept
If Xero has a tax rate you sell at that Stocdup doesn't have yet, you can create the
Stocdup tax type straight from it instead of adding it by hand and linking it afterwards.
You choose its name and classification; the rate comes from Xero. Because it's linked,
invoice lines for products with this tax type carry the Xero rate.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Standard VAT is linked to 20% (VAT on Income)
- No tax type is linked to Xero's 5% (VAT on Income), and none is called Reduced VAT

## Steps
1. Open the synced Xero data and go to Tax types
2. Find the Xero tax rate 5% (VAT on Income)
3. Import it as a new tax type called Reduced VAT, classification Reduced rate

## Done when
5% (VAT on Income) shows as linked to Reduced VAT, and Reduced VAT (5%) is on the Tax types
page.

## Doc notes
- Audience: distributor owner, no technical background

## Open questions
- Can the rate be changed in the dialog, or is it fixed to Xero's? (The dialog has a rate
  field; not checked whether it's editable.)
