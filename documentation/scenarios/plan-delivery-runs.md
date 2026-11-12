---
status: draft
persona: distributor-owner
section: orders-and-deliveries
order: 5
related: [create-delivery-route, accept-order]
---
# Plan a day's deliveries

## Goal
Check a delivery day's runs, put any unassigned deliveries into a run, set the order of
the day's drops, choose who drives, then mark the run ready and download the driver
manifest.

## Concept
Delivery Runs shows one day at a time: a column for each run, and an Unassigned column for
deliveries that aren't on a run yet. Most planning is already done for you: when you
accept an order, it goes into that day's run for the customer's delivery route, in the
route's drop order, and the run starts with the route's default driver. A delivery lands
in Unassigned when its customer isn't on a delivery route, or when its route's run was
already marked ready; the card says which. Planning the day means moving those deliveries
into a run, putting each run's drops in the order the driver should do them, and setting
the driver for the day. These changes only affect that day's run, not the route. When a
run is planned, you mark it ready: that locks its deliveries, order and driver until
someone reopens it, and unlocks the driver manifest, a PDF listing the drops in order.

## Starting data
- The City Centre route has The Blackbird Restaurant, The Anchor Inn and Riverside Bistro,
  in that order, and default driver Chris Moore
- On next Tuesday, The Anchor Inn and Riverside Bistro have accepted orders
  (ORD-2026-50011 and ORD-2026-50012), which are in the City Centre run; the run is
  open, not marked ready
- On next Tuesday, The Grand Hotel Leeds (on no route) has an accepted order,
  ORD-2026-50013, which is unassigned
- No other deliveries or runs exist on next Tuesday

## Steps
1. Open Delivery Runs for next Tuesday
2. Move The Grand Hotel Leeds' delivery into the City Centre run
   Note: the card says why it's unassigned ("No delivery route").
3. Make it the second drop, between The Anchor Inn and Riverside Bistro
   Explain: the run lists the drops in the order the driver will do them; changing it here
   only changes this day's run, not the route.
4. Change the run's driver for the day to Dan Hughes
   Explain: the run starts with the route's default driver; changing it here doesn't
   change the route's default.
5. Mark the City Centre run ready
   Note: this locks the run's deliveries, order and driver until it's reopened.
6. Download the driver manifest
   Explain: the manifest lists the run's drops in order, for the driver to take with them.

## Done when
On next Tuesday the City Centre run is Ready and lists The Anchor Inn, The Grand Hotel
Leeds, Riverside Bistro in that order with driver Dan Hughes, the Unassigned column is
empty, and the downloaded manifest PDF lists the three drops in that order.

## Doc notes
- Audience: operations manager or warehouse staff, no technical background
- Mention: a route can only have one run per day; "Plan a run" adds an empty run for a
  route that has none yet, with the route's default driver
- Mention: a ready run can be reopened if something changes; until then, an order accepted
  for its route that day goes to Unassigned ("Run already marked ready")
- Mention: the manifest can only be downloaded once the run is marked ready
- Mention: to put a customer's future orders on a run automatically, add them to a
  delivery route (link create-delivery-route)

## Open questions
- The dev seed creates the three orders for next Tuesday as submitted (SEED-2026-002xx);
  they must be accepted in the admin after create-delivery-route has run, so acceptance
  puts them into runs. That's run prep, not part of the task.
- Driver name Dan Hughes is invented (the driver field is free text).
