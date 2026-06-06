# ADR-011: Role-based access control (RBAC)

## Status
Accepted

## Context
The platform has multiple distinct user personas with different capabilities. A clear permission model is needed to ensure users can only perform actions appropriate to their role, and that distributor data remains isolated from users of other distributors.

## Decision
The platform uses **role-based access control (RBAC)** with the following roles:

| Role | Description |
|---|---|
| Platform Admin | Wholo platform-level administration across all distributors |
| Distributor Admin | Full access within a single distributor's organisation |
| Warehouse Staff | Stock receiving and fulfilment workflows within a distributor |
| Driver | Delivery workflows only within a distributor |
| Trade Customer | Ordering, invoices and account management for their own organisation |

Roles are scoped to an organisation. A user may hold different roles in different organisations (e.g. a person managing two separate trade customer accounts). Role claims are embedded in the JWT access token (ADR-009) and validated by NestJS guards on each endpoint.

## Consequences
- Authorization decisions are fast — role is read from the JWT claim without a database call.
- New roles can be added without changing the token structure.
- If fine-grained permissions within a role are needed later (e.g. a warehouse staff member who can also approve purchase orders), the model will need to evolve toward attribute-based access control (ABAC) or permission flags.
- Role assignments must be managed carefully at the organisation level; UI for role management is part of the Auth & Users module.
