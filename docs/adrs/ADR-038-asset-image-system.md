# ADR-038: Generic asset image system with server-side processing

## Status

Accepted

## Context

The platform requires product images (and, in future, other asset types such as distributor banners and promotional content) to be stored and served with multiple responsive size variants. Several constraints shaped the design:

- Binary data must not be stored in Postgres (see ADR-016).
- Images must be consistently sized and formatted for predictable rendering in thumbnail lists, catalogue grids, and detail views — source uploads arrive in arbitrary dimensions, aspect ratios, and formats.
- The image schema must not create FK coupling between the `asset_images` table and every entity type that may need images in future (products, banners, etc.), as this would require schema migrations for each new use case.
- CDN configuration (base URL) must be changeable without a data migration.

ADR-016 established object storage for all binary assets and described presigned URL uploads as the preferred upload mechanism. Presigned URLs route uploads directly from the browser to storage, bypassing the API tier. This approach is suitable for large unprocessed assets (PDFs, delivery signatures, videos) but is incompatible with server-side image processing, which must intercept the binary before it reaches storage.

## Decision

### Server-side upload and processing (deviation from ADR-016 for images)

For image assets, the API receives the multipart upload, processes it server-side using **Sharp**, and writes the processed variants to **Cloudflare R2** (S3-compatible). Presigned URL uploads are not used for images because the variant generation pipeline must run between receipt and storage.

Presigned uploads per ADR-016 remain the correct approach for non-image binary assets (PDFs, delivery signatures, video) where server-side transformation is not required.

### Generic registry pattern

A single `asset_images` table holds all image records regardless of entity type. Records are keyed by:

- `assetType` — a string identifier for the asset category (e.g. `"product-image"`)
- `entityId` — the ID of the owning entity (e.g. a product ID)
- `distributorId` — for multi-tenancy scoping and index efficiency

There is no foreign key from `asset_images` to any specific entity table. New asset types are registered at startup via `AssetTypeRegistry`, providing a config object that declares variant specifications, the R2 key template, accepted MIME types, size limits, and an ownership validator function. Adding a new asset type requires no schema migration.

### Keys stored in DB; URLs resolved at read time

The `variants` JSONB column stores **R2 storage keys**, not public URLs (e.g. `distributors/{distributorId}/products/{entityId}/images/{imageId}/thumb.webp`). Public CDN URLs are constructed at read time by `R2StorageService.getPublicUrl()`, which prepends the `R2_PUBLIC_BASE_URL` environment variable.

This means the CDN base URL can be changed (e.g. moving to a different CDN provider or custom domain) by updating the environment variable without any data migration.

### WebP output with three standard variants

All uploaded images are converted to **WebP at quality 85** using Sharp, regardless of source format (JPEG, PNG, WebP). Three variants are generated per upload:

| Variant | Dimensions | Fit | Intended use |
|---|---|---|---|
| `thumb` | 200 × 200 px | cover (square crop) | Thumbnail lists (e.g. portal catalogue row) |
| `catalogue` | 600 × 600 px | inside (letterbox) | Catalogue grids, card views |
| `large` | 1200 × 1200 px | inside (letterbox) | Detail pages, zoom |

These sizes cover the current rendering contexts without client-side resizing. Additional variants can be added to a type's registry config in future without schema changes.

### Primary image tracking

Each entity may have multiple images. One is designated `isPrimary = true`. If the primary image is deleted, the next image by `sortOrder` is automatically promoted. The primary image is the one returned in API responses that include a single representative image (e.g. the catalogue product list).

## Consequences

- **Upload latency**: Sharp processing adds roughly 200ms–2s depending on source file size and resolution. The 10 MB source file limit bounds worst-case processing time.
- **API resource usage**: Image uploads consume API pod CPU during Sharp processing. This is acceptable at current scale; if it becomes a bottleneck, Sharp processing can be moved to a BullMQ worker (ADR-005).
- **CDN egress**: Images are served from the R2 public bucket via CDN. Egress costs scale with traffic; this is expected and acceptable.
- **Variant addition**: Adding a new variant to an existing asset type will not back-fill existing records. Images uploaded before the variant was added will simply not have that key in their `variants` JSON.
- **Non-image binaries**: PDFs, delivery signatures, and video assets continue to follow ADR-016 (presigned URLs, no server-side processing).
