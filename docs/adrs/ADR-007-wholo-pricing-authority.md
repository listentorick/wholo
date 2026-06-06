# ADR-007: Wholo as the pricing authority

## Status
Accepted

## Context
Distributors configure complex customer-specific pricing in Wholo: price lists, customer overrides and promotional pricing. When invoices are created in Xero, the prices on those invoices must match exactly what was agreed in Wholo. If Xero were allowed to apply its own pricing logic, discrepancies would arise between what the customer ordered and what they were invoiced.

## Decision
Wholo is the single source of truth for all pricing. The pricing hierarchy is:

1. Customer-specific pricing override
2. Assigned customer price list
3. Default distributor pricing

Prices calculated by Wholo are passed to Xero during invoice creation and must not be modified by Xero. Xero stores and reports on these prices but does not compute them.

All pricing logic lives in the backend Pricing module. No pricing calculations occur in the frontend.

## Consequences
- Customers always see the same price at ordering time as they are later invoiced.
- Pricing logic is centralised and testable in one place.
- Pricing results are cacheable (see ADR-020) but cache invalidation must be triggered on any price list or customer pricing change.
- If Xero is configured with its own price lists, care must be taken to ensure these do not override invoice line prices sent from Wholo.
