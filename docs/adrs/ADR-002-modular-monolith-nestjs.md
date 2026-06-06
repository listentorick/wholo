# ADR-002: Modular monolith backend with NestJS

## Status
Accepted

## Context
The backend architecture needs to support clear domain boundaries (pricing, ordering, inventory, fulfilment, delivery, invoicing) without becoming a distributed system prematurely. Microservices would provide strong isolation but introduce significant operational overhead — separate deployments, inter-service communication, distributed tracing and eventual consistency — that is not justified at this stage of the product.

A framework choice is also needed. NestJS and Fastify were evaluated.

## Decision
The backend will be built as a **modular monolith** — a single deployable application with clearly separated internal modules, one per domain. Each module owns its own service layer, controllers and data access. Cross-module communication happens through injected services, not network calls.

**NestJS** is chosen as the framework because:
- Its built-in dependency injection and module system maps directly to the domain module structure.
- It enforces separation of concerns without requiring custom scaffolding.
- It provides first-class support for Passport.js (auth), BullMQ (queues) and OpenAPI generation.

Individual modules can be extracted into separate services later if scaling demands it.

## Consequences
- Simple deployment — one API process to build, deploy and operate.
- Clear internal boundaries reduce coupling without the cost of a distributed system.
- Domain modules can be evolved and extracted independently as the product matures.
- The entire backend shares a single Postgres connection pool and Redis instance; connection limits must be managed as the application scales.
- NestJS's opinions (decorators, DI) mean the codebase has a steeper learning curve than a minimal Fastify setup.
