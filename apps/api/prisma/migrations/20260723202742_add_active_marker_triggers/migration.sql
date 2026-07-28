-- Hand-written, not schema.prisma-diffed: Prisma has no trigger support in
-- any form (no schema DSL attribute, no preview feature, no introspection
-- awareness — confirmed against Prisma's docs and issue tracker). Unlike the
-- partial indexes this replaces, triggers are entirely invisible to every
-- Prisma tool (schema language, db pull, migrate dev's diffing), so this
-- cannot cause the recurring drift problem ADR-052 fixes — Prisma will never
-- try to create, alter, or drop something it doesn't know exists.
--
-- Each trigger makes its table's "active" marker column fully
-- self-maintaining at the database level, independent of application code —
-- restoring the same bypass-proof guarantee the old partial indexes gave,
-- which a purely application-maintained column would not (a raw insert that
-- forgets to set the marker would otherwise silently violate the "one active
-- row" rule with no error). See ADR-052.

-- accounting_connections: connectedDistributorId mirrors distributorId only
-- while status = 'CONNECTED'.
CREATE OR REPLACE FUNCTION set_accounting_connection_marker() RETURNS TRIGGER AS $$
BEGIN
  NEW."connectedDistributorId" := CASE WHEN NEW."status" = 'CONNECTED' THEN NEW."distributorId" ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_connections_set_marker
BEFORE INSERT OR UPDATE ON "accounting_connections"
FOR EACH ROW EXECUTE FUNCTION set_accounting_connection_marker();

-- trade_relationships: activeAccountNumber mirrors accountNumber only while
-- deletedAt is null.
CREATE OR REPLACE FUNCTION set_trade_relationship_marker() RETURNS TRIGGER AS $$
BEGIN
  NEW."activeAccountNumber" := CASE WHEN NEW."deletedAt" IS NULL THEN NEW."accountNumber" ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_relationships_set_marker
BEFORE INSERT OR UPDATE ON "trade_relationships"
FOR EACH ROW EXECUTE FUNCTION set_trade_relationship_marker();

-- customer_accounting_mappings: linkedMarker is true only while unlinkedAt is
-- null.
CREATE OR REPLACE FUNCTION set_customer_accounting_mapping_marker() RETURNS TRIGGER AS $$
BEGIN
  NEW."linkedMarker" := CASE WHEN NEW."unlinkedAt" IS NULL THEN true ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_accounting_mappings_set_marker
BEFORE INSERT OR UPDATE ON "customer_accounting_mappings"
FOR EACH ROW EXECUTE FUNCTION set_customer_accounting_mapping_marker();

-- product_accounting_mappings: same pattern as customer_accounting_mappings.
CREATE OR REPLACE FUNCTION set_product_accounting_mapping_marker() RETURNS TRIGGER AS $$
BEGIN
  NEW."linkedMarker" := CASE WHEN NEW."unlinkedAt" IS NULL THEN true ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_accounting_mappings_set_marker
BEFORE INSERT OR UPDATE ON "product_accounting_mappings"
FOR EACH ROW EXECUTE FUNCTION set_product_accounting_mapping_marker();
