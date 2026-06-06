# Wholo – Product Requirements Document (PRD)

# Glossary

The examples below reference the wine industry vertical, however the platform is intended to remain industry-agnostic.

## Distributor / Wholesaler

A business that purchases products from producers/suppliers and sells them to trade customers.

Example:

* a wine wholesaler selling wine to restaurants and bars

Within Wholo, distributors/wholesalers are the primary operational users of the platform and are responsible for:

* inventory
* pricing
* customer management
* purchasing
* deliveries
* fulfilment workflows

---

## Trade Customer

A business purchasing products from a distributor/wholesaler.

Examples:

* restaurants
* bars
* hotels
* cafés
* retailers

---

## Producer / Supplier

An upstream business supplying products to distributors/wholesalers.

Examples:

* vineyard
* winery
* brewery
* manufacturer
* importer

Within Wholo, producer/supplier records are primarily used for:

* purchasing
* incoming stock
* purchase orders
* supplier relationship management

---

# Wholo is a multi-sided platform

## Platform-level positioning

Wholo is a mobile-first wholesale commerce platform that connects wholesalers and distributors with trade customers, helping both sides manage ordering, invoices, payments and ongoing supplier relationships digitally.

---

## Distributor / wholesaler perspective

Wholo enables wholesalers and distributors to digitise customer ordering, manage inventory, fulfil deliveries, issue invoices, collect payments and grow trade customer relationships from one simple platform.

---

## Trade customer perspective

Wholo helps trade customers find wholesalers and distributors, place orders, manage invoices and build lasting supplier relationships from one simple platform.

---

# 1. Product Overview

Wholo is a mobile-first wholesale commerce, operations and distributor discovery platform designed for wholesalers, distributors and trade customers.

The platform enables distributors and wholesalers to:

* manage customer ordering portals
* manage inventory and stock movements
* manage producer/supplier purchasing
* process customer orders
* manage deliveries
* manage customer accounts
* integrate invoicing and accounting through Xero
* promote products through rich merchandising and sales content

The platform also enables trade customers to:

* discover wholesalers and distributors
* request trade accounts
* browse distributor catalogues
* place orders digitally
* manage invoices and payments
* build ongoing supplier relationships

Wholo combines operational workflows with modern wholesale commerce experiences.

The initial target market is the wine distribution industry, however the platform must remain industry-agnostic and support future expansion into additional wholesale sectors.

---

# 2. Product Vision

Wholo aims to become the operating system for modern wholesale distribution.

The platform combines:

* B2B ordering
* inventory management
* distributor discovery
* invoicing
* delivery workflows
* customer account management
* sales enablement
* digital merchandising

into a single mobile-first platform.

Wholo should modernise wholesale operations while also helping distributors sell more effectively through digital experiences.

---

# 3. Goals

## Primary Goals

| Goal/Outcome                                                         | How Wholo does it                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reduce manual order processing                                       | Wholo moves orders from calls, emails and WhatsApp into a structured digital ordering flow. Orders are submitted with products, quantities, customer details, agreed pricing, delivery preferences and account terms already captured, reducing re-keying and admin.                         |
| Reduce phone/email-based ordering                                    | Trade customers can browse catalogues, repeat previous orders, save favourites and place orders directly through Wholo. This reduces the need for wholesalers to manually take orders over the phone, chase emails, or interpret informal messages.                                          |
| Improve customer self-service                                        | Trade customers can manage common tasks themselves: viewing products, checking pricing, placing orders, seeing order history, viewing invoices, checking delivery status and managing supplier relationships without needing to contact the wholesaler for every query.                      |
| Improve stock visibility                                             | Wholo gives customers and internal teams clearer visibility of product availability, stock status and substitutions. This helps prevent customers ordering unavailable items and gives wholesalers better control over what can be sold, reserved or fulfilled.                              |
| Simplify warehouse workflows                                         | Orders arrive in a consistent format and can be turned into picking, packing and fulfilment workflows. Warehouse teams can see what needs to be prepared, prioritised, dispatched or substituted without relying on paper notes or manually interpreted order messages.                      |
| Improve delivery tracking                                            | Wholo connects orders to delivery status, helping wholesalers track what has been picked, dispatched, delivered or still outstanding. Trade customers can see where their order is in the fulfilment process, reducing “where is my order?” calls.                                           |
| Improve invoice visibility                                           | Invoices are linked to orders and customer accounts, giving both wholesalers and trade customers a clearer view of what has been issued, paid, overdue or outstanding. This reduces confusion and supports faster payment collection.                                                        |
| Improve mobile ordering experiences                                  | Wholo is mobile-first, so trade customers can place orders quickly from wherever they are: stockroom, shop floor, kitchen, warehouse, van or office. The experience is designed around repeat ordering, saved products, previous orders and simple checkout rather than desktop-heavy admin. |
| Enable businesses to discover and connect with wholesalers digitally | Wholo gives trade customers a distributor discovery experience where they can find relevant wholesalers, view product ranges, understand delivery terms, and start a digital trading relationship without relying only on word-of-mouth, Google searches, trade shows or cold outreach.      |
| Improve product discovery and cross-selling opportunities            | Wholo helps wholesalers present products digitally through searchable catalogues, categories, featured ranges, recommendations, alternatives, seasonal products and related items. This creates more opportunities for customers to discover products they were not previously ordering.     |

## Secondary Goals

* Reduce stock discrepancies
* Reduce operational admin
* Improve customer retention
* Improve payment visibility
* Improve order accuracy
* Improve operational efficiency
* Increase basket size and repeat purchasing

---

# 4. Target Users

## Distributors / Wholesalers

Businesses selling products to trade customers.

Responsible for:

* inventory
* customer management
* pricing
* purchasing
* deliveries
* invoicing workflows
* product merchandising

---

## Warehouse Staff

Responsible for:

* receiving stock
* dispatching orders
* updating inventory states

---

## Delivery Drivers

Responsible for:

* delivering customer orders
* confirming deliveries
* collecting signatures
* recording delivery issues

---

## Trade Customers / Buyers

Businesses that purchase products from distributors/wholesalers.

Responsible for:

* browsing products
* placing orders
* reviewing invoices
* making payments
* managing supplier relationships
* viewing order history
* viewing delivery status

Examples:

* restaurants
* bars
* hotels
* cafés
* retailers

---

## Prospective Trade Customers

Businesses that are not yet connected to a distributor/wholesaler but use Wholo to discover and request access to suppliers.

Responsible for:

* searching for distributors/wholesalers
* viewing supplier/distributor profiles
* reviewing product ranges
* checking delivery areas
* requesting trade accounts
* starting new supplier relationships

Examples:

* a restaurant looking for a new wine supplier
* a bar searching for a new drinks wholesaler
* a hotel looking for regional food and beverage suppliers

---

# 5. Core Product Principles

* Mobile-first design
* Simple operational workflows
* Customer self-service
* Industry-agnostic core platform
* Modern consumer-grade UX
* Commerce-driven experience
* Relationship-driven distributor experiences
* Integration-first accounting approach
* Minimal training requirements
* Operational simplicity over ERP complexity

---

# 6. Functional Requirements

# 6.1 Distributor Discovery Portal

The platform must support distributor discovery functionality for trade customers.

## Distributor Marketplace

Trade customers must be able to:

* browse distributors
* search distributors
* filter distributors by category or industry
* view distributor profiles

Distributor profiles may include:

* company information
* branding
* categories
* featured products
* promotional content
* delivery regions
* contact details

## Distributor Requests

Trade customers must be able to:

* request access to distributor catalogues
* request trade accounts

Distributors must be able to:

* approve or reject customer access requests

## Distributor-Created Customers

Distributors must also be able to:

* manually create customer accounts
* invite customers onto the platform

---

# 6.2 Customer Portal

## Customer Login

Customers must be able to:

* securely log in
* reset passwords
* manage users within their organisation

## Customer Pricing Assignment

When creating or managing a customer account, distributors must be able to:

* assign an existing price list to the customer
* create a customer-specific price list
* override individual product pricing for specific customers

Customers should only see pricing associated with:

* their assigned price list
* their negotiated trade pricing
* their customer-specific pricing rules

## Customer-Specific Catalogues

Customers must only see:

* products available to them
* customer-specific pricing
* negotiated trade pricing

## Product Browsing

Customers must be able to:

* browse products
* search products
* filter products
* view stock availability

## Product Information

Products may include:

* product name
* producer/manufacturer
* vintage (where applicable)
* bottle size
* case size
* tasting notes
* images
* pricing
* stock status
* promotional content
* video content

## Ordering

Customers must be able to:

* add products to basket
* place orders
* reorder previous purchases
* save favourite products
* clone an order and edit it
* schedule repeating orders

## Order History

Customers must be able to:

* view historical orders
* view order statuses
* view delivery statuses

## Invoice Visibility

Customers must be able to:

* view invoices
* view invoice statuses
* view paid/unpaid balances
* download invoices

## Payments

Some customers must be able to:

* pay invoices directly within the platform
* use card payments
* use mobile payment methods where supported

## Credit Management

Customers must be able to:

* view available credit
* view account balances
* view overdue balances

---

# 6.3 Commerce & Merchandising

The platform must support distributor merchandising and sales enablement functionality.

## Product Recommendations

The platform should support:

* similar products
* substitute products
* frequently purchased together
* distributor recommendations
* featured products

## Promotional Content

Distributors should be able to:

* feature products
* promote seasonal products
* highlight new arrivals
* showcase recommended products

## Rich Media Content

Distributors should be able to upload:

* videos
* tasting notes
* producer stories
* educational content
* product imagery

Rich media may appear:

* on product pages
* on distributor pages
* within promotional areas

## Video Content

Distributors should be able to:

* upload product videos
* embed hosted video content

Customers should be able to:

* watch videos directly within the platform

Example use cases:

* product introductions
* wine tasting videos
* producer stories
* featured seasonal collections

---

# 6.4 Product & Pricing Management

Distributors must be able to:

* create products
* edit products
* archive products

Products must support:

* SKU
* producer/supplier association
* pricing
* stock quantities
* case/bottle metadata
* optional vintage metadata

Products may support:

* substitute products
* alternative products

## Price Lists

The platform must support reusable price lists.

Distributors must be able to:

* create price lists
* edit price lists
* duplicate price lists
* archive price lists

Price lists may support:

* customer groups
* product-specific pricing
* percentage discounts
* fixed pricing
* promotional pricing

## Customer-Specific Pricing

Distributors must be able to:

* create entirely bespoke pricing for individual customers
* override standard price list pricing
* customise pricing at product level

## Pricing Hierarchy

Pricing should follow a predictable hierarchy:

1. Customer-specific pricing override
2. Assigned customer price list
3. Default distributor pricing

---

# 6.5 Producer / Supplier Management

Distributors must be able to:

* create producer/supplier records
* manage producer/supplier details
* manage producer/supplier contacts

Producer/supplier records may include:

* contact details
* payment terms
* lead times

---

# 6.6 Purchase Orders

Distributors must be able to:

* create purchase orders to producers/suppliers
* manage purchase order statuses
* track incoming deliveries

Purchase orders must support:

* partial deliveries
* full deliveries
* expected delivery dates

Purchase order statuses may include:

* Draft
* Ordered
* Partially Received
* Fully Received
* Cancelled

---

# 6.7 Inventory Management

The platform must support basic inventory management.

## Inventory States

Inventory must support:

* Available Stock
* Reserved Stock
* Incoming Stock
* Delivered Stock
* Damaged Stock

## Stock Receiving

Warehouse staff must be able to:

* receive stock against purchase orders
* partially receive stock
* fully receive stock

Receiving stock must:

* increase inventory
* create stock movement records

## Stock Reservation

When customer orders are placed:

* stock must become reserved
* available stock must reduce accordingly

## Dispatch Workflow

When orders are dispatched:

* stock states must update appropriately

## Delivery Completion

When deliveries are completed:

* reserved stock must be removed from inventory

## Stock Adjustments

Authorised users must be able to:

* record damaged stock
* record lost stock
* record stock corrections

All adjustments must create stock movement records.

---

# 6.8 Alternative Products & Availability

When products are unavailable:

* customers may be shown substitute products
* customers may be shown estimated restock dates

Alternative products must be configurable by distributors.

## Out of Stock Alternatives

When a product is out of stock, the platform must recommend suitable alternative products to the customer.

Distributors must be able to configure alternative products for each product.

Alternative products may be based on:

* similar product type
* similar price point
* same producer or brand
* same region or category
* same customer price list
* available stock

When an item is out of stock, customers should be shown:

* recommended alternatives
* current stock status
* estimated restock date, where available
* clear messaging that the original item is unavailable

Customers should be able to:

* select an alternative product
* add the alternative product to basket
* continue with their order without restarting the checkout process

Alternative recommendations should only show products that:

* the customer is allowed to buy
* are visible in the customer’s catalogue
* have valid pricing for that customer
* are currently available, unless clearly marked otherwise

---

# 6.9 Delivery Management

## Delivery Tracking

Orders must support delivery statuses.

Statuses may include:

* Pending
* Picked
* Dispatched
* Delivered
* Failed Delivery

## Delivery Availability Rules

Distributors must be able to specify where they can deliver, for example:

* within 50 miles of Oldham
* UK-wide
* worldwide
* excluded delivery regions

Distributors must be able to configure delivery availability rules for customers based on:

* geographic region
* postcode
* delivery zone
* customer account
* delivery schedule

Examples:

* Manchester customers may receive next-day delivery
* Leeds customers may receive delivery within 3 days
* certain regions may only receive deliveries on specific weekdays

The platform should support:

* configurable delivery lead times
* configurable delivery days
* estimated delivery dates during checkout
* delivery availability messaging

## Customer Delivery Selection

During checkout, customers should be able to:

* view estimated delivery dates
* select from available delivery dates where applicable
* view delivery restrictions or unavailable dates

The platform should prevent customers from selecting unavailable delivery windows.

## Delivery Scheduling Visibility

Distributors and warehouse staff should be able to:

* view scheduled deliveries
* manage delivery queues
* view upcoming delivery commitments

## Driver Workflow

Drivers must be able to:

* view assigned deliveries
* mark deliveries as complete
* record delivery issues
* record damaged items

## Delivery Signatures

Drivers must be able to:

* collect customer signatures using mobile devices

---

# 6.10 Mobile Experience

The platform must be fully mobile responsive.

Key mobile workflows include:

* customer ordering
* warehouse stock receiving
* delivery confirmation
* signature capture

The platform should prioritise:

* fast interactions
* low-friction workflows
* touch-first interfaces

---

# 6.11 Xero Integration

Xero will act as the system of record for:

* invoices
* invoice status
* payments
* customer balances
* credit notes

Wholo will act as the system of record for:

* product catalogues
* customer-specific pricing
* ordering workflows
* stock availability
* merchandising
* wholesale pricing logic

## Product Import From Xero

The platform must support importing products from Xero.

Imported product information may include:

* product name
* SKU/code
* description
* base pricing
* tax settings

Distributors should be able to:

* import products during onboarding
* synchronise products from Xero
* map imported products into Wholo product structures

Wholo should allow distributors to:

* enrich imported products with additional commerce metadata
* add imagery
* add merchandising content
* add customer-specific pricing
* add substitute products
* add stock information

## Pricing Authority

Wholo pricing must act as the pricing authority for customer orders.

This means:

* customer-specific pricing configured in Wholo is the authoritative pricing source
* prices passed from Wholo to Xero during invoice creation must remain unchanged
* Xero should not override pricing originating from Wholo

Wholo pricing capabilities may include:

* customer-specific pricing
* negotiated trade pricing
* promotional pricing
* case pricing
* volume pricing

## Invoice Creation Flow

Typical workflow:

1. Customer places order in Wholo
2. Wholo calculates pricing
3. Wholo creates invoice in Xero
4. Xero stores invoice and accounting records
5. Invoice status synchronises back to Wholo

The invoice values generated by Wholo should be preserved within Xero.

Wholo is not intended to replace accounting software.

---

# 7. Non-Functional Requirements

## Ease of Use

The platform must require minimal training.

## Performance

Core workflows should perform efficiently on mobile devices.

## Scalability

The platform should support future expansion into additional wholesale industries.

## Security

Customer and financial data must be securely managed.

---

# 8. Out of Scope (Initial Version)

The following are out of scope for the initial release:

* advanced warehouse management
* route optimisation
* procurement forecasting
* manufacturing
* accounting ledger functionality
* advanced BI/reporting
* barcode scanning
* multi-warehouse management
* advanced delivery routing
* producer/supplier EDI integrations
* AI-generated recommendations

---

# 9. Future Opportunities

Potential future capabilities include:

* barcode scanning
* route optimisation
* warehouse locations
* sales representative workflows
* AI-assisted ordering
* forecasting
* producer/supplier integrations
* EDI integrations
* recommendation engines
* customer analytics
* loyalty systems
* vertical-specific modules

---

# 10. Success Metrics

Wholo should aim to:

* reduce manual order entry
* reduce operational admin
* reduce stock discrepancies
* improve ordering efficiency
* improve mobile usability
* improve customer self-service
* improve payment visibility
* improve order accuracy
* improve distributor/customer connectivity
* increase repeat customer ordering
* increase average basket size
* improve product discovery
