---
status: draft
persona: distributor-owner
section: customers
order: 3
seed: dev-seed
related: [delivery-profile-setup, add-customer]
---
# Set a customer's delivery address and profile

## Goal
Say where a customer's orders are delivered and which delivery profile decides their
delivery dates.

## Concept
A customer's delivery address is where you deliver their orders; leave it blank to use
the address they registered with. Their delivery profile decides which delivery dates
they can choose when they order: a customer with no profile can't choose any.

## Starting data
- The Ivy Wine Bar is on the Saturday Express delivery profile
- The Western Suburbs delivery profile exists (created by delivery-profile-setup)

## Steps
1. Open The Ivy Wine Bar's Delivery tab
2. Set its delivery address to 14 Corn Street, Bristol, BS1 1HQ
3. Change its delivery profile to Western Suburbs
4. Save

## Done when
The Ivy Wine Bar's Delivery tab shows 14 Corn Street, Bristol, BS1 1HQ and the Western
Suburbs profile.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: changing the profile changes which dates the customer can choose from now on

## Open questions
- Western Suburbs isn't in the dev seed; it exists locally from the delivery-profile-setup
  run. Use Standard Weekday instead to keep it seed-only?
- Do orders the customer has already placed keep their delivery date? Not clear from the
  code.
- The delivery route (which run a customer's orders go on) is set on the Delivery Routes
  page, not here; link create-delivery-route?
