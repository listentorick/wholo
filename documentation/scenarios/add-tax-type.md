---
status: draft
persona: distributor-owner
section: catalogue-and-pricing
order: 2
related: [add-product]
---
# Add a tax type

## Goal
Add a tax type with its classification and rate, so you can give it to your products.

## Concept
A tax type is the tax a product is sold with, such as standard-rate VAT at 20%. Every
product needs one before you can make it Active, so customers never see a product that
has no tax set. Its classification says what kind of tax it is: zero-rated, exempt and
outside the scope of tax all charge £0, but stay distinguishable on orders. When an
order is placed, its lines keep the rate they were ordered at.

## Starting data
- Standard VAT is the only tax type; none called Reduced VAT exists

## Steps
1. Start a new tax type called Reduced VAT
2. Set its classification to Reduced rate and its rate to 5%
3. Create the tax type

## Done when
Reduced VAT shows in the tax types list with the Reduced rate classification and a 5%
rate.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: a product can't be made Active until it has a tax type
