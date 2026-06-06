# ADR-014: Docker containers, Kubernetes orchestration and Helm charts

## Status
Accepted

## Context
The platform has seven application services that need to be deployed, scaled and operated reliably. A container-based deployment model provides consistency between development and production environments and enables horizontal scaling.

## Decision
All application services are **containerised with Docker**. Each service has its own `Dockerfile`.

Services are orchestrated with **Kubernetes**. Deployment configuration is managed as **Helm charts**, covering all services, ingress rules, configuration, secrets references and scaling policies.

Key Kubernetes considerations:
- `wholo-worker` may run as multiple replicas — BullMQ distributes jobs across all worker instances safely.
- `wholo-scheduler` must run as a single replica to prevent duplicate repeatable job registration.
- Kubernetes liveness and readiness probes point to each service's `/health` endpoint.
- Prisma migrations run as a Kubernetes Job (pre-deployment hook) before the new API version starts.

## Consequences
- Consistent environments from local Docker Compose through to production Kubernetes.
- Horizontal scaling is available for the API and worker tiers without application changes.
- Helm charts must be maintained alongside the application code; chart changes should be reviewed with the same rigour as application changes.
- Kubernetes adds operational complexity; a managed Kubernetes service (e.g. GKE, EKS, AKS) is recommended to reduce cluster management overhead.
