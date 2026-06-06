# ADR-001: Web-first, mobile-first platform with API-first backend

## Status
Accepted

## Context
Wholo needs to serve trade customers, distributor admins, warehouse staff and drivers across a range of devices. Native mobile apps provide the best mobile experience but carry significant build and maintenance cost across two platforms (iOS and Android). A web-based approach can be shipped faster and still deliver a strong mobile experience with responsive design.

However, the decision to start on web must not prevent native mobile apps from being introduced later.

## Decision
The initial version of Wholo will be a web-based platform with a mobile-first, responsive UI. The backend will expose stable REST APIs that are not tightly coupled to the web frontend, so the same APIs can be consumed by future native mobile apps without rearchitecting the backend.

## Consequences
- Faster initial delivery — no native app build, review or distribution overhead.
- A single codebase serves all personas via the browser.
- Mobile experience is constrained to what a progressive web app can offer (no native device APIs without additional work).
- Native mobile apps can be added later by consuming the existing API.
- API design must be treated as a product interface from day one, not an internal implementation detail.
