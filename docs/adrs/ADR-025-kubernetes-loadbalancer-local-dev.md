# ADR-025: Kubernetes LoadBalancer services for local development

## Status
Accepted

## Context
Wholo runs on Kubernetes (Docker Desktop locally, managed K8s in production). During local development, services need to be reachable from the developer's host machine — the browser must reach the portal, and the portal must reach the API.

The options considered were:

1. **LoadBalancer services** — each service declares `type: LoadBalancer`; Docker Desktop's built-in controller binds the service port directly to `localhost`.
2. **NodePort services** — exposes a high port (30000–32767) on the node; requires the developer to use an awkward port or maintain a mapping.
3. **Ingress controller (e.g. Traefik, nginx-ingress)** — a single entry point on port 80/443 with host- or path-based routing; adds an extra infrastructure component and TLS config.
4. **kubectl port-forward** — developer runs a manual command per session; not persistent and inconvenient.

## Decision
Use `type: LoadBalancer` services for all externally-reachable workloads. Docker Desktop automatically assigns `localhost` as the external IP for each LoadBalancer service, binding the declared port directly on the host. No ingress controller is installed for local development.

Each service declares its own port in `values.yaml`, and ports are chosen to avoid conflicts with common local processes (e.g. the portal uses `3010` rather than `3000`).

In staging and production the same Helm chart is used; `values.yaml` per environment overrides the service type to `ClusterIP` and routes traffic through an ingress controller instead.

## Consequences
- Developers open `http://localhost:<port>` directly — no extra tooling or port-forward commands required.
- Port conflicts on the developer's machine will prevent Docker Desktop from binding the service; the service shows `EXTERNAL-IP: <pending>`. Resolution is to change the port in `values.yaml` or free the conflicting process.
- No ingress controller means no TLS, no path-based routing, and no middleware (rate limiting, auth headers) locally. This is acceptable for inner-loop development.
- Adding an ingress controller for local dev (to closer mirror staging) is a straightforward future step — swap `type: LoadBalancer` to `ClusterIP` and add an Ingress resource pointing at the same services.
