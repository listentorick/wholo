---
status: draft
persona: distributor-owner
section: customers
order: 5
related: [add-customer, accept-order]
---
# Set up payment terms

## Goal
Create payment terms that say when invoices are due, and give them to a customer.

## Concept
Payment terms decide an invoice's due date: due straight away, a number of days after the
invoice date, a number of days after the end of the invoice month, the next given weekday,
or the next given day of the month. You can make one set of terms your default, and give
any customer different terms on their Account tab. When you accept an order, Stocdup works
out the due date from the customer's terms and fixes it on the order, so changing the
terms later doesn't change orders you've already accepted. If you use Xero, Xero manages
due dates until you make one of your own terms the default.

## Starting data
- The Grand Hotel Leeds is a customer with no payment terms of its own
- No payment terms exist, so there is no default

## Steps
1. Start new payment terms called 30 days end of month
2. Make them due 30 days after the end of the invoice month, and create them
3. Open The Grand Hotel Leeds' Account tab
4. Set its payment terms to 30 days end of month, and save

## Done when
The Grand Hotel Leeds shows 30 days end of month as its payment terms, marked Set for this
customer, and the Payment terms page shows 30 days end of month with 1 customer.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: the order shows the due date it was given when it was accepted
- Mention: "Use default instead" puts a customer back on your default terms
- Mention: deactivating payment terms moves their customers back to the default; orders
  already accepted keep their due dates

## Open questions
- Making terms the default is left out (it's a toggle on the Payment terms page); add it as
  a step?
