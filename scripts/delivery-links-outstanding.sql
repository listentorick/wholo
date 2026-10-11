-- Runs whose manifest was printed before the delivery-token signing key was
-- switched and that still have deliveries to record. While this returns
-- rows, the OLD public key must stay in deliveryToken.publicKeys, or the QR
-- codes on those printed manifests stop opening.
-- See docs/runbook/keys-and-certificates.md (Delivery token keys).
--
-- Read-only. Pass the moment the new private key went live, in UTC:
--   psql ... -v switched_at='2026-10-11 14:30:00' < scripts/delivery-links-outstanding.sql
--
-- A run reprinted after the switch is still listed if it was also printed
-- before it: the older sheet of paper may be the one in the van.
SELECT d.name            AS distributor,
       r.name            AS run,
       r."deliveryDate"  AS delivery_date,
       r."driverName"    AS driver,
       (SELECT max(a."createdAt") FROM audit_logs a
         WHERE a.action = 'DELIVERY_RUN_MANIFEST_GENERATED' AND a."entityId" = r.id
           AND a."createdAt" < :'switched_at'::timestamp) AS printed_with_old_key,
       count(*)          AS deliveries_outstanding
FROM delivery_runs r
JOIN organisations d            ON d.id = r."distributorId"
JOIN delivery_run_order ro      ON ro."runId" = r.id AND ro."removedAt" IS NULL
JOIN orders o                   ON o.id = ro."orderId"
LEFT JOIN order_delivery_outcomes oc ON oc."orderId" = o.id
WHERE oc.id IS NULL
  AND o.status NOT IN ('CANCELLED', 'REJECTED')
  AND EXISTS (SELECT 1 FROM audit_logs a
               WHERE a.action = 'DELIVERY_RUN_MANIFEST_GENERATED' AND a."entityId" = r.id
                 AND a."createdAt" < :'switched_at'::timestamp)
GROUP BY d.name, r.id, r.name, r."deliveryDate", r."driverName"
ORDER BY r."deliveryDate", d.name, r.name;
