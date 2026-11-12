---
status: draft
persona: distributor-owner
section: orders-and-deliveries
order: 2
seed: dev-seed
related: [accept-order, cancel-order]
---
# Reject an order

## Goal
Turn down a new order you can't take, and tell the customer why.

## Concept
A new order waits for your review until you accept or reject it. Rejecting is for orders
you won't take at all. You give a reason, the customer is told, and they'll need to submit
a new order if they still want the items. You can only reject an order that hasn't been
accepted; once it's accepted, you cancel it instead.

## Starting data
- The Painted Lady has a submitted order awaiting review

## Steps
1. Open The Painted Lady's order from the orders awaiting review
2. Reject it with the reason "We no longer stock two of these lines — please reorder from
   the updated catalogue."

## Done when
The order shows as Rejected, with the date and the reason.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: a reason is required, and the customer is notified
- Mention: to stop an order you've already accepted, cancel it instead (link cancel-order)

## Open questions
- The Painted Lady's order comes from the demo dashboard data, not the dev seed. The dev
  seed's only submitted order (The Blackbird Restaurant) is the one accept-order uses. Use
  the demo order, or add a second submitted order to the dev seed?
- Does the customer's notification include the reason? Not confirmed.
