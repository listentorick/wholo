# ADR-076 — Delivery Links: Random Tokens, Checked Before the Body Is Read

**Status**: Accepted
**Date**: 2026-10-16
**Deciders**: Rick Walsh
**Related**: ADR-059 (delivery link design, amended by this ADR), ADR-026 (BFF per portal), ADR-069 (encrypted off-site backups)

---

## Context

ADR-059 made the QR link on a printed manifest a signed pointer to an order: `<orderId>.<signature>`, sent as the `X-Delivery-Token` header, with the signature an HMAC over the order id. The routes that accept it have no login; the token is the only credential.

A review of the `multer` advisories found four weaknesses:

1. **The token was checked too late.** In both the driver BFF and `apps/api`, the photo upload's `FileInterceptor` (multer) parsed the request body before any code looked at the token. The BFF did not check it at all; it forwarded everything. Anyone on the internet could reach the body parser of a public service.
2. **A completed delivery's upload was refused only after the body had been read.** `DeliveryPhotoService` answered 410 once an outcome was recorded, but only after multer had parsed the whole image.
3. **The key failed open.** The chart defaulted `api.deliveryTokenSigningKey` to an empty string. An environment that never set it signed links with an empty HMAC key, which anyone could reproduce.
4. **Every driver shared one rate limit.** `apps/api`'s throttle on these routes counted by caller address, and every request arrives from the driver BFF.

A first version of this ADR replaced the HMAC with Ed25519 signatures, so the BFF could verify a link with a public key without being able to create one. It was built, then withdrawn before release. A delivery link is a bearer secret: whoever holds it can use it, and a signature makes it no harder to steal or misuse than an unguessable random value. Signing only bought the BFF the ability to check a link without asking `apps/api`. That cost a key pair to generate, store, rotate and retire, a runbook for doing so safely, and a QR code twice as dense.

No delivery links were in real use when this was decided, so the token format could change without a migration period.

## Decision

### 1. The link carries a random token stored on the order

- `Order.deliveryLinkToken` (nullable, unique) holds 16 bytes from Node's `crypto.randomBytes`, base64url: 128 bits in 22 characters. It is never derived from the order id, the order number, the time or a counter.
- `DeliveryLinkTokensService.ensureFor` creates it the first time a manifest including the order is printed. A conditional update (`where deliveryLinkToken is null`) means two prints racing cannot overwrite each other.
- After that the token never changes. Reprinting a manifest reproduces identical QR codes, and a link keeps working until its delivery is recorded (ADR-059: a driver cannot get a replacement code in the field).
- The link stays `${DRIVER_APP_URL}/d#<token>`. It is in the URL fragment, which browsers never send to a server (ADR-059).
- `apps/api` resolves a token with a single indexed lookup. A token of the wrong shape is refused before it reaches the database.

There is no key, so there is nothing to configure, rotate or leak from the cluster's Secrets. `DELIVERY_TOKEN_SIGNING_KEY` and the chart value that set it are removed.

### 2. Nothing is parsed until the link is known to be real and still open

**`apps/api`.** `DeliveryLinkGuard` runs on every delivery-link route:
- it resolves the token to its order;
- it refuses an unknown token with 404, and a cancelled or rejected order with 410;
- it hands the order to the handler through `@DeliveryOrder()`.

On routes marked `@OpenDeliveryOnly()` (upload photo, delete photo) it also refuses with 410 once an outcome is recorded. Guards run before interceptors, so all of this happens before multer reads a byte. The checks inside `DeliveryPhotoService` stay as a second line of defence for a request racing a submission.

**Driver BFF.** Its own `DeliveryLinkGuard`:
- refuses a missing or malformed token on every route with 404, without calling `apps/api`;
- before a photo upload, which is the one route with a large body, asks `apps/api` with the existing `GET /delivery-links`, and lets the body be read only on 200 with `state: 'PENDING'`. A 404 or 410 from `apps/api` is passed straight back; `SUBMITTED` becomes 410.

The BFF still holds no secret and has no database. Other routes are forwarded, and `apps/api`'s guard decides before reading anything; their bodies are small JSON or none.

`POST outcome` is deliberately not closed by the guard. Its idempotent retry (the same outcome again answers 200) and its 409 for a different outcome are handled in the service, so a driver whose connection dropped mid-submission gets the right answer.

An integration test proves the ordering. An oversized upload gets 413 for an open delivery, so its body was read. It gets 404 for an unknown token and 410 for a recorded delivery or a cancelled order, so it was refused unread.

### 3. Rate-limited per link

`DeliveryLinkThrottlerGuard` counts requests by the `X-Delivery-Token` header instead of by caller address. Each link gets 20 requests a minute, whichever driver uses it and however the request is forwarded.

### 4. Nothing personal after delivery

Once an outcome is recorded, the link shows the order number, the distributor, the outcome, when it was recorded and the driver's name. It no longer shows the customer's name. The address, contact details and products were already hidden (PRD §13). Photos and the signature are never returned through a link; they are visible only in the admin app.

### 5. The admin BFF loses its database credentials

Found in the same review: `wholo-admin-api`'s Secret carried `DATABASE_URL`, although `apps/admin-api` never opens a database connection (ADR-026). It is removed. No BFF holds a secret.

## Alternatives considered

- **Ed25519 signatures with a public-key list** (built, then withdrawn). They let the BFF reject a forged link without a call to `apps/api`. This gives no extra security for a bearer link, and it brings key management and longer QR codes. At delivery-link volumes, one extra `GET` before an upload costs nothing that matters.
- **Storing only a hash of the token.** A copy of the database would then hold no working links. But a reprint could no longer reproduce the same link, and the database copies that leave the cluster, the backups, are already encrypted (ADR-069).
- **Checking for a recorded outcome in the BFF on every route.** It would double the calls for no gain: only the upload has a body worth protecting.

## Consequences

- An anonymous caller can no longer reach the upload parser in either service. Nor can a genuine link to a completed delivery, or to a cancelled order. A genuine link to an open delivery still can, which is why multer itself was also patched (2.4.0).
- A link is a bearer secret. **Anyone holding a printed manifest can act on its undelivered orders until they are delivered**: record a false outcome, or add photos. This is accepted for now. The limits are that it covers only that one run, a false "delivered" emails the customer, and no money or stock moves. Requiring a driver login on top of the link would remove the risk; that is a separate decision.
- A copy of the database contains working links. Backups are encrypted before they leave the cluster (ADR-069).
- A single link cannot be revoked yet other than by cancelling the order. Reopening a recorded delivery from the admin app does not exist; when it is built, the same link will simply work again, because "completed" means an outcome row exists.
- Every link printed before this release stops working. Acceptable now; from here on a link never changes.
- A future public endpoint with its own credential should follow the same shape. Check it in a guard, before any interceptor, in the BFF and again in `apps/api`. Where the body is large, have the BFF confirm with `apps/api` before reading it.
