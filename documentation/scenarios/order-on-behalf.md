---
status: draft
persona: distributor-owner
section: orders-and-deliveries
order: 4
seed: dev-seed
related: [place-order, accept-order]
---
# Place an order on a customer's behalf

## Goal
Take an order for a customer who rings or emails it in, by placing it in their portal for
them.

## Concept
Order on behalf opens the customer's portal in a new tab, signed in as you acting for
that customer. You see their catalogue, prices and delivery dates, and place the order
exactly as they would. The order is the customer's, so it appears in their order history.

## Starting data
- The Grand Hotel Leeds can order from the Featured Selection catalogue, with delivery
  dates available next week

## Steps
1. Open The Grand Hotel Leeds' customer record and start ordering on its behalf
2. Add 12 bottles of Château Belmont Rouge 2021 to the basket
3. Check out with the first available delivery date
4. Place the order and finish ordering on its behalf

## Done when
The order shows on the Orders page for The Grand Hotel Leeds.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: only Owners and Operations managers can order on a customer's behalf

## Open questions
- Is the order accepted straight away, or does it wait for review like any other? Is it
  marked as placed on the customer's behalf anywhere? Not clear from the code.
- How the session ends ("order-as ended" page) is unconfirmed; the run will settle it.
- The Grand Hotel Leeds' catalogue: confirm it includes Château Belmont Rouge 2021.
