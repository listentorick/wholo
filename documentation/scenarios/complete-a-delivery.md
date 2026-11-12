---
status: draft
persona: driver
section: making-deliveries
order: 1
seed: dev-seed
related: [plan-delivery-runs, check-proof-of-delivery]
---
# Record a delivery

## Goal
As a driver, record that an order was delivered, with who received it, a photo and their
signature, from the link on the driver manifest.

## Concept
Each order on a driver manifest has its own QR code. Scanning it opens that order's
delivery page on the driver's phone, with no login. The driver records one outcome:
Delivered (handed to a person, or left in a safe location) or Unable to deliver, with a
reason. The recipient's name, notes, photos and signature are optional, so a delivery can
always be recorded. Once it's submitted the outcome can't be changed from the link, and
the order shows as Delivered (or Delivery failed) with its proof of delivery.

## Starting data
- The City Centre run for next Tuesday is marked ready, with The Grand Hotel Leeds' order
  SEED-2026-00203 on it (left by plan-delivery-runs)
- No outcome has been recorded for that order

## Steps
1. Open the delivery link for The Grand Hotel Leeds' order
2. Choose Deliver
3. Say it was handed to a person
4. Enter the recipient, Sam Patel, and add a photo of the delivery
5. Get the recipient's signature and confirm the delivery
6. Review and submit

## Done when
The delivery page shows the delivery as recorded, and in the admin app the order shows
Delivered with a proof of delivery naming Sam Patel, with the photo and signature.

## Doc notes
- Audience: delivery drivers, on a phone, no technical background
- Mention: no login is needed; the link only works for that one order
- Mention: if it can't be delivered, choose Unable to deliver and pick a reason
- Mention: Partially delivered is shown but not available yet ("Coming soon")
- Capture at a phone-sized viewport

## Open questions
- Drivers get the link by scanning the manifest's QR code. The run can't scan, so it has to
  open the link directly (decoded from the manifest PDF). That breaks the "no typed URLs"
  rule; is it acceptable here?
- Needs a `driver` persona in `scenario-docs.yml` (login: none).
- Location: is it shown to the driver, and how does the page behave when the browser
  refuses location? (Proof of delivery records "Location unavailable".) Not confirmed.
- Running this changes The Grand Hotel Leeds' order to Delivered, which plan-delivery-runs'
  re-run notes don't undo. It also gives check-proof-of-delivery dev-seed data: switch that
  scenario to use this order?
