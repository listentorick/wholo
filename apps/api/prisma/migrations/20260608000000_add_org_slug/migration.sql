-- AlterTable: add slug column
ALTER TABLE "organisations" ADD COLUMN "slug" TEXT;

-- Backfill slugs for existing distributor organisations derived from their name
UPDATE "organisations"
SET "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-z0-9]+', '-', 'gi')))
WHERE "type" = 'DISTRIBUTOR' AND "slug" IS NULL;

-- Add unique constraint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_slug_key" UNIQUE ("slug");
