---
status: draft
persona: distributor-owner
section: delivery-setup
order: 1
related: [plan-delivery-runs, delivery-profile-setup]
---
# Create a delivery route

## Goal
Create a delivery route, give it a default driver, add its customers, and put them in the
order your driver will deliver to them.

## Concept
A delivery route is a group of customers your driver usually delivers to on one trip, in
a set order. Each customer can be on only one route. When you accept an order, it is added
to that day's run for the customer's route (the run is created if there isn't one yet)
and takes the customer's place in the route's drop order, so the run and the driver's
manifest list the deliveries in that order. That's why the drop order should be the order
you want your driver to visit the customers. Customers with no order that day simply don't
appear in the run, and a delivery already in a run keeps its place if you change the order
later.

## Starting data
- The Anchor Inn, Riverside Bistro and The Blackbird Restaurant are customers on no route
- No delivery routes exist

## Steps
1. Start a new delivery route called City Centre
2. Give it the code CC and the default driver Chris Moore
3. Create the route
   Note: customers can only be added once the route has been created.
4. Add The Anchor Inn, Riverside Bistro and The Blackbird Restaurant to it
   Note: each customer joins at the end of the drop order, and a customer already on
   another route can't be added.
5. Put the drops in the order the driver will do them: The Blackbird Restaurant first,
   then The Anchor Inn, then Riverside Bistro
   Explain: the drop order is the order your driver delivers in. Each day's run and the
   driver's manifest list the deliveries in this order, so set it to the route you want
   driven.

## Done when
City Centre's customers are listed in the order The Blackbird Restaurant, The Anchor Inn,
Riverside Bistro, and the Delivery Routes page shows City Centre with driver Chris Moore and
3 customers.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: the drop order saves as soon as you move a customer
- Mention: deleting a route deactivates it, and its customers need a new route before their
  orders are added to runs automatically
