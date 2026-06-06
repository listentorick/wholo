# ADR-005: BullMQ for background job processing

## Status
Accepted

## Context
Several platform operations are too slow, unreliable or integration-heavy to run synchronously in the API request path: Xero product imports, invoice creation, invoice/payment synchronisation, media processing, email and push notifications, search index refreshes and scheduled repeat orders. These must run asynchronously and be retried on failure.

## Decision
BullMQ (backed by Redis) is used for all background job processing. Jobs are enqueued by the API and processed by the `wholo-worker` service, which is deployed and scaled independently from the API.

BullMQ also handles recurring scheduled jobs (via repeatable jobs) in the `wholo-scheduler` service. The scheduler runs as a single replica to avoid duplicate job registration.

BullMQ was chosen over alternatives because:
- It is a mature, well-maintained Node.js queue library with strong TypeScript support.
- Redis is already a required infrastructure dependency (ADR-004), so no additional service is needed.
- It supports retries, backoff, job prioritisation, rate limiting and delayed jobs out of the box.

## Consequences
- The worker and scheduler are separately deployable; worker replicas can be scaled horizontally without duplicating scheduled jobs.
- Job failures are visible in the BullMQ dashboard and should be surfaced through Grafana alerting.
- Worker code must be idempotent — jobs may be retried after partial completion.
- Redis must be available for the queue to function; downtime pauses job processing but does not lose enqueued jobs if Redis persistence is enabled.
