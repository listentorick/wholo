# ADR-023: Product ingestion pipeline

## Status

Accepted

## Context

Distributors need to get their product catalogues into Wholo. The most common starting point is an existing Xero account where products are already defined as items. In the future, other sources such as spreadsheets, CSV files and supplier documents will also need to be supported.

Wholo is the source of truth for product data. This has two implications:

1. The initial product catalogue may be bootstrapped from an external source (e.g. Xero), but once products exist in Wholo, Wholo owns them.
2. Changes made to products in Wholo must be propagated back to systems that need to stay in sync (specifically Xero, which references Wholo products when creating invoices).

Other future ingestion sources (Excel, CSV, documents) are **ingestion only** — data flows into Wholo but Wholo does not write back to those sources.

## Decision

### Wholo as product source of truth

Wholo is the authoritative source for all product data including name, description, SKU, pricing, product type and metadata. No external system may override product data in Wholo.

### Xero relationship

The Xero product integration operates in two directions:

**1. Initial import (one-time bootstrap)**
When a distributor connects Xero, their existing Xero items are imported into Wholo to seed the initial product catalogue. This is a one-time operation. The distributor reviews and confirms the import before it is committed.

During import, Xero does not have a concept of product types. Product types are inferred using a rule-based classifier (keyword matching on product name and description) followed by an LLM classification step for unmatched products. The distributor confirms or corrects the inferred product type during the review step.

The Xero `ItemID` is stored on each imported Wholo product as an external reference for future synchronisation.

**2. Ongoing sync (Wholo → Xero)**
After the initial import, Wholo is the source of truth. When products are created, updated or archived in Wholo, the corresponding Xero item is updated asynchronously via the worker queue:

- Product created in Wholo → create item in Xero, store `xeroItemId`
- Product updated (name, description) → update item in Xero
- Product archived in Wholo → mark item inactive in Xero
- Product price updated → update `SalesDetails.UnitPrice` on the Xero item

This ensures Xero's item list remains current so invoice line items can reference valid Xero item codes.

### Other ingestion sources (future)

Excel, CSV, document and other future source types are **ingestion only**. Data flows into Wholo; Wholo does not write back to the source. These sources follow the same ETL pipeline but without a synchronisation step.

### Pipeline architecture

All ingestion runs asynchronously via BullMQ using an ETL pattern:

```
Source trigger / file upload
        ↓
[Source Connector]      parse source into normalised raw records
        ↓
[Field Mapper]          apply stored mapping rules: source field → Wholo field
        ↓
[Validator]             check required fields, types, SKU uniqueness
        ↓
[Type Classifier]       infer product type (rule-based, then LLM for unmatched)
        ↓
[Review Step]           distributor reviews mapped records before committing
        ↓
[Loader]                write to product catalogue in a single transaction
        ↓
[Import Report]         per-record success / failure / warning summary
```

### Source connectors

Connectors are pluggable. Each connector outputs a normalised array of raw records so the downstream pipeline is source-agnostic. The connector interface is defined from day one.

| Connector | Source | v1 |
|---|---|---|
| `XeroConnector` | Xero API | Yes |
| `ExcelConnector` | `.xlsx` / `.xls` | Future |
| `CsvConnector` | `.csv` | Future |
| `DocumentConnector` | PDF / other documents | Future |

### Field mappings

Field mappings are stored in the database per distributor per source type. They define how source fields map to Wholo canonical fields and are reusable across subsequent imports from the same source. Mappings support direct field mapping, static default values and simple transformations (trim, uppercase, unit conversion).

### Human review step

The review step is optional per source. Distributors can mark a source as trusted, in which case imports auto-commit without a manual review step. The review step is always available regardless.

### Import job lifecycle

Import jobs are tracked as database records:

```
Pending → Processing → AwaitingReview → Committed
                                      → Failed
                                      → Cancelled
```

This allows distributors to close the browser and return to review large imports later.

## Consequences

- Wholo's product catalogue is always the authoritative source — no external system can silently override it.
- Xero item synchronisation runs asynchronously and is retry-safe via BullMQ; Xero downtime does not block product management in Wholo.
- The `xeroItemId` external reference on the product record must be present for invoice creation to succeed; products created in Wholo without a Xero counterpart must trigger an async create-item job before invoicing is possible.
- Product type inference reduces manual work during the Xero bootstrap but requires a review step to catch misclassifications.
- The pluggable connector interface means new ingestion sources can be added without modifying the core pipeline.
- Other ingestion sources (Excel, CSV, documents) do not trigger Xero write-back — only changes made within Wholo do.
