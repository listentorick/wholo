---
status: draft
persona: distributor-owner
section: integrations/xero/customers
order: 3
related: [import-customer-from-xero, match-customers-to-xero, bulk-import-products-from-xero]
---
# Import several customers from Xero at once

## Goal
Bring a batch of Xero contacts into Stocdup as customers in one go, and check the import
report for what happened to each.

## Concept
You can select several contacts on the Contacts tab and import them together as
customers, each linked to its contact. The import runs in the background and you're
notified when it's done. A contact with a suggested match is linked to that customer only
if you tick "Honour suggested matches"; otherwise it becomes a new customer alongside the
one it matched. Contacts that can't be imported, such as archived ones or ones Xero
doesn't treat as customers, are skipped. The Bulk import report lists every contact and
its outcome.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced, with no customers
- Xero's Harbour Lights Hotel, Olive Tree Deli and Fenwick Wine Bar are ready to import

## Steps
1. Open the synced Xero data and go to Contacts
2. Select Harbour Lights Hotel, Olive Tree Deli and Fenwick Wine Bar
3. Import them
4. Open the import report when it's done

## Done when
The Bulk import report shows all three contacts as Imported, and the three customers are
on the Customers page.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: imported customers still need a delivery profile, catalogue and price list
  before they can order

## Open questions
- What account numbers bulk-imported customers get (none, or Xero's) is unconfirmed.
