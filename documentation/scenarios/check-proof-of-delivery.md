---
status: draft
persona: distributor-owner
section: orders-and-deliveries
order: 6
seed: dev-seed
related: [plan-delivery-runs]
---
# Check proof of delivery

## Goal
See how and when an order was delivered: who received it, their signature, the delivery
photo and where the driver was. For a delivery that failed, see why.

## Concept
When the driver finishes a drop, they record the outcome on their phone: delivered
(handed to someone, or left in a safe location) or unable to deliver, with a reason. They
can add the recipient's name, a signature and a photo, and the phone's location is
captured when the driver allows it. The order then shows as Delivered or Delivery failed,
and its proof of delivery keeps everything the driver recorded, with the driver's name,
the run, and when it was captured and sent. It's what you check when a customer says an
order never arrived.

## Starting data
- Highfield Golf Club has a delivered order from a recent delivery day, handed to a named
  person, with a signature, a photo and a location
- Northgate Social has an order the driver couldn't deliver because the customer refused it

## Steps
1. Find Highfield Golf Club's delivered order
2. Open its proof of delivery
3. Check who received it, their signature and the delivery photo
4. Check where it was delivered
5. Open the proof of delivery for Northgate Social's failed delivery and see why it failed

## Done when
Highfield Golf Club's proof of delivery shows Delivered, the recipient's name, a
signature, a photo and a location on the map; Northgate Social's shows Unable to deliver
with the reason Customer refused delivery.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: proof of delivery is only there for orders the driver has recorded (Delivered
  or Delivery failed)
- Mention: "Captured on device" and "Submitted to Stocdup" can differ when the driver had
  no signal

## Open questions
- These orders come from the demo dashboard data (`pnpm db:demo:dashboards`), not the dev
  seed: its outcomes have signatures, photos and locations; the dev seed's have none.
  Regenerating the demo data wipes and recreates orders (including the plan-delivery-runs
  ones), so the run should use whatever is there rather than re-run it. Add it to the
  config as its own seed, or extend the dev seed with one full proof of delivery?
- The "Captured on device" vs "Submitted" mention is inferred from the two fields;
  confirm that's the intent.
