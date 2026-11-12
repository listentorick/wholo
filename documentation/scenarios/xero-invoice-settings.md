---
status: draft
persona: distributor-owner
section: integrations/xero/setting-up
order: 3
related: [invoice-sent-to-xero]
---
# Choose how invoices are created in Xero

## Goal
Decide whether the invoices Stocdup sends to Xero arrive as drafts, waiting for approval
or ready to send, and which sales account they're posted to.

## Concept
Each order you accept becomes an invoice in Xero. Its status there decides how much
checking happens before your customer sees it: a Draft for you to review and approve in
Xero, Submitted for approval, or Authorised, issued straight away and ready to be paid.
Each line is posted to its linked Xero item's sales account; the default sales account
covers lines with no account of their own (an unlinked product, say). With no default,
Xero decides.

## Starting data
- Vine & Co is connected to Xero (Demo Company (UK)) and has synced
- Invoices are created as Draft, and no default sales account is chosen

## Steps
1. Open the synced Xero data and go to Settings
2. Choose Authorised for new invoices
3. Choose 200 Sales as the default sales account
4. Save

## Done when
Settings shows Authorised and the default sales account 200 Sales, saved.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: the setting applies to orders accepted from now on

## Open questions
- The account's label in the list ("200 Sales" or "Sales (200)") is unconfirmed.
