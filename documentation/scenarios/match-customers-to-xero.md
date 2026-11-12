---
status: draft
persona: distributor-owner
section: integrations/xero/customers
order: 1
related: [import-customer-from-xero, link-customer-from-its-record, invoice-sent-to-xero]
---
# Match your customers to Xero

## Goal
Link your customers to their contacts in Xero, by confirming the matches Stocdup suggests
and matching the rest yourself.

## Concept
An accepted order is sent to Xero as an invoice for the customer's linked contact. A
customer with no link can't be invoiced: the invoice fails until you link it. Each sync,
Stocdup suggests a contact when its account number, email or name matches a customer's
(or a similar name has the same postcode), and shows why. It never links anything on its
own, so a contact under a different trading name is matched by hand.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- The Blackbird Restaurant, The Anchor Inn and Riverside Bistro exist, none linked
- Xero's Blackbird Restaurant Ltd is suggested for The Blackbird Restaurant (same email),
  and Anchor Inn Harrogate for The Anchor Inn (same account number, VC-1002)
- Xero's RB Hospitality Ltd (Riverside Bistro's trading company) has no suggestion

## Steps
1. Open the synced Xero data and go to Contacts
2. Find Blackbird Restaurant Ltd, check why it was suggested, and confirm the match
3. Confirm Anchor Inn Harrogate for The Anchor Inn
4. Find RB Hospitality Ltd and match it to the existing customer Riverside Bistro

## Done when
On the Contacts tab, Blackbird Restaurant Ltd, Anchor Inn Harrogate and RB Hospitality Ltd
show as linked to The Blackbird Restaurant, The Anchor Inn and Riverside Bistro.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: contacts Xero doesn't treat as customers (suppliers) can't be imported or
  matched from this list

## Open questions
- Demo Company (UK)'s own sample contacts are in the list too; the run finds ours by
  searching their names.
- "Contacts that aren't customers can't be matched from this list" is inferred from the
  row actions (no actions for "Supplier in Xero"); confirm on the run.
