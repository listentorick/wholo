---
status: draft
persona: distributor-owner
section: integrations/xero/customers
order: 2
related: [match-customers-to-xero, bulk-import-customers-from-xero, add-customer]
---
# Add a customer from a Xero contact

## Goal
Create a new Stocdup customer from a contact you already have in Xero, linked to it from
the start.

## Concept
A Xero contact that isn't in Stocdup yet can be imported as a new customer. Its name,
email and address come from Xero, and you can set the name and account number as you
import it. Because it's linked, orders you accept from this customer are invoiced to the
right Xero contact. Only contacts Xero treats as customers can be imported.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced, with no customers
- Xero's The Crown & Kettle (orders@crownandkettle.example) is ready to import

## Steps
1. Open the synced Xero data and go to Contacts
2. Find The Crown & Kettle
3. Import it as a new customer with account number VC-2001
4. Open the new customer

## Done when
The Crown & Kettle is on the Customers page with account number VC-2001 and email
orders@crownandkettle.example, and its Xero contact shows as linked to it.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: an imported customer still needs a delivery profile, catalogue and price list
  before they can order (link set-customer-catalogue-and-price-list)
- Mention: to import several contacts at once, see bulk-import-customers-from-xero

## Open questions
- Which fields the import dialog offers beyond name and account number, and whether the
  new customer is Active straight away, are unconfirmed; the run will show.
