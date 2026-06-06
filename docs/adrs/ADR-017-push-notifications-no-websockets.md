# ADR-017: Push notifications via FCM; no WebSockets in v1

## Status
Accepted

## Context
Certain platform events benefit from proactive notification — most notably, a distributor admin receiving an alert when a trade customer places a new order. Two real-time delivery mechanisms were considered: WebSocket connections (persistent, bidirectional) and push notifications (server-initiated, device-level).

WebSockets were also evaluated for live UI updates (order status, delivery tracking).

## Decision
**WebSockets and server-sent events are out of scope for v1.** The platform's workflows are asynchronous by nature. Distributor admins and warehouse staff do not need a live-updating UI — they work through task queues and check back when needed. Polling or user-triggered refresh is sufficient for v1.

**Push notifications** via **Firebase Cloud Messaging (FCM)** are used for time-sensitive operational events. The primary use case is alerting distributor admins when a new order is placed. FCM supports both web browsers (Web Push API) and future native mobile apps (APNs / FCM), making it a suitable choice for the current and future platform.

Push notification delivery is handled asynchronously via the BullMQ worker queue — notifications are not sent in the order placement request path.

The decision to exclude WebSockets will be revisited if warehouse coordination or live tracking needs emerge at scale.

## Consequences
- No persistent connection infrastructure needed in v1.
- FCM handles delivery across web and future native mobile with a single integration.
- Distributor admins must grant browser notification permissions for web push to work; this requires UX handling for the permission prompt.
- FCM delivery is best-effort; critical operational state (order status, stock levels) must always be readable from the UI, not relying solely on push delivery.
