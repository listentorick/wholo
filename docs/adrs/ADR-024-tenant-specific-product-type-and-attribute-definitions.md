# ADR-024: Distributor-Specific Product Type and Attribute Definitions

## Status

Proposed

## Context

Wholo must support products across different wholesale sectors. The initial focus may be wine, but the platform should also support other product types such as beer, spirits, bread, cheese, coffee, food, meat and cleaning products.

Different product types require different product information. For example, a wine product may need vineyard, vintage, bottle size, grape variety and ABV. A bread product may need weight, flour type, allergens, sliced/unsliced and shelf life.

These product definitions should not be hard-coded into the database schema or frontend forms. Each distributor should be able to define the product types they sell and the attributes that apply to those product types.

The product type and attribute definitions will be used for:

* generating product entry and edit forms
* validating product metadata
* controlling product card and product detail display
* powering customer-facing catalogue filtering and sorting

## Decision

Wholo will use distributor-specific product type definitions and distributor-specific attribute definitions.

Each distributor can define one or more product types, such as:

```text
Wine
Beer
Bread
Cheese
Cleaning Product
```

Each product type can have a set of attribute definitions. An attribute definition describes a field that can be captured against a product.

For example:

```text
Product Type: Wine

Attributes:
- Vineyard
- Vintage
- Bottle size
- Grape variety
- ABV
- Region
- Organic
```

Attribute definitions will be stored relationally and will include metadata such as:

```text
key
label
data type
unit
required
filterable
sortable
show on product card
show on product detail page
display order
```

Controlled attributes, such as vineyard, region, grape variety, allergen or wine type, may define a set of allowed options. These options will also be stored relationally.

This ADR does not decide how product attribute values are stored. That is covered separately.

## Example Model

```text
Distributor
  id
  name

ProductType
  id
  distributor_id
  name
  code
  display_order

AttributeDefinition
  id
  distributor_id
  product_type_id
  key
  label
  data_type
  unit
  required
  filterable
  sortable
  show_on_card
  show_on_detail
  display_order

AttributeOption
  id
  distributor_id
  attribute_definition_id
  label
  value
  normalised_label
  status
  display_order
```

## Form Generation

Product entry and edit forms will be generated from the product type's attribute definitions.

For example, when a distributor creates or edits a wine product, Wholo loads the `Wine` product type and its attributes. The form can then be generated dynamically.

Example:

```text
Vineyard        select
Vintage         number
Bottle size     select or number
Grape variety   multi-select
ABV             decimal
Organic         checkbox
Tasting notes   text area
```

The form should use the attribute definition to decide:

```text
field label
input type
required validation
allowed options
display order
help text
unit display
```

This avoids hard-coding wine-specific, food-specific or sector-specific forms into the application.

## Filtering and Sorting

Attribute definitions also control which product fields can be exposed as filters or sort options in the customer-facing catalogue and ordering portal.

For example, a distributor may mark the following wine attributes as filterable for trade customers:

```text
Wine type
Region
Grape variety
Vintage
Bottle size
Organic
ABV
```

Wholo can then generate customer-facing catalogue filters from the attribute definitions.

Example catalogue filters:

```text
Wine Type
- Red
- White
- Rosé
- Sparkling

Region
- Bordeaux
- Rioja
- Tuscany

Vintage
- 2018
- 2019
- 2020
- 2021

Organic
- Yes
- No
```

Only attributes marked as `filterable` should be exposed as filters in the customer-facing catalogue / ordering portal.

Only attributes marked as `sortable` should be available as customer-facing catalogue sort options.

The `filterable` and `sortable` flags are primarily customer catalogue concerns. Internal distributor administration screens may still provide operational search or filtering over additional fields where required, but those internal filters should be treated separately from customer-facing catalogue filters.

## Controlled Options

Some attributes should use controlled option values rather than free text.

Examples:

```text
Vineyard
Region
Wine type
Grape variety
Allergen
Flour type
Closure type
Product style
```

Controlled options improve consistency and make filtering and future reporting more reliable.

For example, without controlled options, the same vineyard could be entered as:

```text
Château Musar
Chateau Musar
CHATEAU MUSAR
Ch. Musar
Musar
```

With controlled options, the distributor can maintain a canonical option for that vineyard.

This gives cleaner product entry, catalogue filters and future reporting.

## Rationale

This approach allows Wholo to support different wholesale sectors without creating separate database tables or frontend forms for every product type.

It also allows each distributor to configure product metadata in a way that matches their business. One distributor may define wine products differently from another distributor.

By storing product type and attribute definitions relationally, Wholo gets a governed metadata model that can be used consistently for:

```text
product entry forms
validation
customer-facing catalogue filters
product cards
product detail pages
future reporting
future search indexing
```

## Consequences

### Positive Consequences

* Product types are distributor-specific.
* Product attributes are distributor-specific.
* Forms can be generated dynamically.
* Customer-facing catalogue filters can be generated dynamically.
* Controlled options improve data consistency.
* Wholo can support multiple wholesale sectors without schema changes for every vertical.
* Distributors can customise product metadata to match their business.

### Negative Consequences

* Product configuration becomes more complex than fixed product fields.
* The application must include a metadata validation layer.
* Controlled option management is required for filterable or selectable attributes.
* Care must be taken to avoid distributors creating inconsistent or duplicate attributes.
* Attribute configuration changes may affect forms, filters and product display.

## Summary

Wholo will use distributor-specific product types and distributor-specific attribute definitions to describe product metadata.

These definitions will drive product entry forms, validation, catalogue display, customer-facing filtering and customer-facing sorting.

Controlled option attributes will be used where consistency matters, especially for attributes used in customer catalogue filtering or future reporting.

This gives Wholo a flexible product model without hard-coding each wholesale vertical into the database schema or frontend application.
