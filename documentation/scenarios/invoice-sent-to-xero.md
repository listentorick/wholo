---
status: draft
persona: distributor-owner
section: integrations/xero/invoices
order: 1
related: [xero-invoice-settings, match-customers-to-xero, accept-order]
---
# Send an order's invoice to Xero

## Goal
Accept an order and see its invoice in Xero, with the amount still due, on the order.

## Concept
When you accept an order from a customer linked to Xero, Stocdup creates the invoice in
Xero for you, at Stocdup's prices, with the order number as its reference. Lines for
linked products carry the Xero item's code, and each line's tax comes from its tax type's
linked Xero rate. Stocdup then follows the invoice in Xero: once a sync has seen it, the
order shows the invoice number, what's been paid and what's still due. If the customer
isn't linked to a Xero contact, the invoice can't be created; the order says so, and you
can retry once it's linked.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced; invoices are created
  as Draft
- Botanica Bar & Kitchen is linked to its Xero contact, and has one order awaiting review,
  ORD-2026-60001: 12 × Prosecco Extra Dry for delivery next Thursday
- Prosecco Extra Dry is linked to the Xero item WINE-007, and Standard VAT to 20% (VAT on
  Income)

## Steps
1. Open order ORD-2026-60001
2. Accept the order
3. Sync with Xero to bring the invoice's status back
   Note: Stocdup also checks unpaid invoices on its own every 15 minutes.
4. Open the order again

## Done when
Order ORD-2026-60001 shows an Invoice & payment section with its Xero invoice number,
total and the amount still due.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: when the invoice is paid in Xero, the order shows what's been paid after the
  next sync
- Mention: whether the invoice arrives as a draft or ready to send is set in Settings
  (link xero-invoice-settings)

## Open questions
- Should step 3 be on the page, or should the run wait for the automatic check instead?
  Syncing is a real way to see it sooner, but readers don't have to.
