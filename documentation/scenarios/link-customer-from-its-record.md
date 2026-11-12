---
status: draft
persona: distributor-owner
section: integrations/xero/customers
order: 4
related: [match-customers-to-xero, invoice-sent-to-xero]
---
# Link a customer to Xero from the customer

## Goal
Link a customer to their Xero contact from the customer's own page, and see the link
there.

## Concept
Each customer has an Integrations tab showing its link to Xero: the linked contact, when
it was linked and by whom, and when Stocdup last synced. Until a customer is linked, the
tab warns that their invoices can't be sent to Xero, shows the contact Stocdup suggests
if there is one, and lets you search Xero's contacts yourself.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Highfield Golf Club isn't linked; Stocdup suggests the Xero contact Highfield Golf Club
  for it, by name

## Steps
1. Open the customer Highfield Golf Club and go to its Integrations tab
2. Check the suggested Xero contact
3. Link the customer to it

## Done when
Highfield Golf Club's Integrations tab shows the linked contact Highfield Golf Club,
linked by James Vine, and no longer warns about invoices.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: with no suggestion, search Xero's contacts by name from the same tab
- Mention: Unlink removes the link; the customer's invoices then can't be sent until it's
  linked again
