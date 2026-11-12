---
status: draft
persona: distributor-owner
section: orders-and-deliveries
order: 3
seed: dev-seed
related: [reject-order, accept-order]
---
# Cancel an accepted order

## Goal
Cancel an order you've already accepted but can no longer fulfil, and tell the customer
why.

## Concept
Use cancel for an order that can't be fulfilled, even after you've accepted it, for
example when stock falls through. You can cancel an order that's submitted or accepted,
but not one that's been delivered. You give a reason and the customer is notified.

## Starting data
- Bramble & Co has an accepted order that hasn't been delivered

## Steps
1. Open Bramble & Co's accepted order
2. Cancel it with the reason "Our supplier has cancelled this shipment — sorry for the
   inconvenience."

## Done when
The order shows as Cancelled, with the reason.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: for a new order you don't want to take, reject it instead (link reject-order)

## Open questions
- Bramble & Co's order comes from the demo dashboard data. Use it, or add an accepted order
  to the dev seed?
- What happens to the order's place in a delivery run, and to an invoice already sent to
  Xero, when it's cancelled? Not clear from the code; the run will show the run side.
