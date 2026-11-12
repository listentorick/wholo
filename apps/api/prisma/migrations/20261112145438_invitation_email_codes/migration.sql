-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_INVITE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'STAFF_INVITE_ACCEPTED';

-- AlterTable
ALTER TABLE "customer_invitations" ADD COLUMN     "acceptedByUserId" TEXT;

-- CreateTable
CREATE TABLE "invitation_email_codes" (
    "id" TEXT NOT NULL,
    "customerInvitationId" TEXT,
    "staffInvitationId" TEXT,
    "keycloakSub" TEXT NOT NULL,
    "claimantEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_email_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_email_codes_customerInvitationId_keycloakSub_key" ON "invitation_email_codes"("customerInvitationId", "keycloakSub");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_email_codes_staffInvitationId_keycloakSub_key" ON "invitation_email_codes"("staffInvitationId", "keycloakSub");

-- AddForeignKey
ALTER TABLE "customer_invitations" ADD CONSTRAINT "customer_invitations_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_email_codes" ADD CONSTRAINT "invitation_email_codes_customerInvitationId_fkey" FOREIGN KEY ("customerInvitationId") REFERENCES "customer_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_email_codes" ADD CONSTRAINT "invitation_email_codes_staffInvitationId_fkey" FOREIGN KEY ("staffInvitationId") REFERENCES "staff_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
