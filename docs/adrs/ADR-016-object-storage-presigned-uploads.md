# ADR-016: Object storage for media with presigned URL uploads

## Status
Accepted

## Context
The platform stores product images, product videos, distributor branding assets, delivery signatures and generated PDF documents. Storing binary files in Postgres is inefficient and does not scale. Large files (particularly product videos) must not be routed through the API tier.

## Decision
All binary assets are stored in **object storage** (e.g. AWS S3, Google Cloud Storage or equivalent). Postgres stores only metadata and storage references — never binary data.

**Presigned URLs** are used for uploads: the API issues a short-lived presigned URL, and the client uploads directly from the browser to object storage. This avoids routing large files through the API tier and keeps the API process lightweight.

Download URLs may also be presigned (for private assets such as delivery signatures) or served via a CDN (for public assets such as product images).

## Consequences
- Large media uploads do not consume API server resources or bandwidth.
- Presigned URL expiry must be configured appropriately — short enough to prevent misuse, long enough to complete typical uploads.
- The API must track upload completion (e.g. via a callback or a post-upload confirmation request) to associate the stored object with the relevant record.
- Object storage costs must be monitored as media volume grows, particularly for video content.
- A CDN in front of object storage is recommended for public product images and videos to reduce latency and storage egress costs.
