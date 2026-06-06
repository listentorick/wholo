# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wholo is a **mobile-first wholesale commerce and operations platform** connecting wholesalers/distributors with trade customers. The initial target vertical is wine distribution, but the platform must remain industry-agnostic.

## Core Domain Model

Three primary actor types:

- **Distributor / Wholesaler** — the primary operational user; owns inventory, pricing, customer management, purchasing, deliveries, and fulfilment workflows.
- **Trade Customer** — a business buying from a distributor (restaurants, bars, hotels, retailers). Uses the platform to browse catalogues, place orders, view invoices, and track deliveries.
- **Producer / Supplier** — upstream supplier to distributors; used for purchasing, incoming stock, and purchase orders.

## Key Product Modules

| Module | Notes |
|---|---|
| Distributor Discovery Portal | Marketplace for trade customers to find and request access to distributors |
| Customer Portal | Catalogue browsing, ordering, reorder, favourites, invoice visibility, payments, credit |
| Commerce & Merchandising | Product recommendations, promotional content, rich media and video |
| Product & Pricing Management | Products with SKU/stock/vintage metadata; price lists with hierarchy: customer-specific override → assigned price list → default pricing |
| Producer / Supplier Management | Supplier records, contacts, payment terms, lead times |
| Purchase Orders | PO lifecycle: Draft → Ordered → Partially Received → Fully Received → Cancelled |
| Inventory Management | Stock states: Available / Reserved / Incoming / Delivered / Damaged; reservation on order placement |
| Delivery Management | Delivery statuses, geographic availability rules, driver workflow, signature capture |
| Xero Integration | Xero is system of record for invoices/payments/balances; Wholo is pricing authority — prices must not be overridden by Xero |

## Architecture Principles (from PRD)

- **Mobile-first**: all core workflows (ordering, stock receiving, delivery confirmation, signature capture) must work well on mobile.
- **Xero integration-first**: invoices flow Wholo → Xero; pricing authority stays in Wholo.
- **Industry-agnostic core**: no wine-specific assumptions in data models or workflows.
- **Minimal training**: operational simplicity over ERP complexity.

## Out of Scope (v1)

Advanced warehouse management, route optimisation, procurement forecasting, barcode scanning, multi-warehouse, BI/reporting, AI recommendations, EDI integrations.

## Reference

Full product requirements are in `prd.md`.
