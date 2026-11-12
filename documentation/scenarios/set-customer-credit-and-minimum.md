---
status: draft
persona: distributor-owner
section: customers
order: 4
seed: dev-seed
related: [change-order-settings, create-payment-terms]
---
# Set a customer's credit limit and minimum order

## Goal
Give a customer a credit limit and their own minimum order value.

## Concept
A customer's credit limit is how much you're happy for them to owe. Their account
dashboard compares what they owe, plus orders not yet invoiced, with that limit. Their
minimum order replaces your company minimum for that customer: they can't submit an order
below it. Both are set on the customer's Account tab.

## Starting data
- Highfield Golf Club has no credit limit and no minimum order of its own

## Steps
1. Open Highfield Golf Club's Account tab
2. Set its credit limit to £2,000.00
3. Set its minimum order to £150.00
4. Save

## Done when
Highfield Golf Club's Account tab shows a £2,000.00 credit limit and a £150.00 minimum
order, and its Dashboard tab shows what it owes against the £2,000 limit.

## Doc notes
- Audience: distributor owner or operations manager, no technical background
- Mention: the credit limit doesn't stop the customer ordering; it's for you to keep an
  eye on

## Open questions
- The money fields show a "$" sign although Vine & Co uses GBP (likely a bug). Fix before
  running, so the screenshots match "£"?
- Customers never see their credit limit or notes (from the customer record model); worth
  stating?
