/*
  Warnings:

  - A unique constraint covering the columns `[keycloakId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "keycloakId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_keycloakId_key" ON "users"("keycloakId");
