-- Migration: reports
-- Adds the Report model (HU-8.6 — ver y gestionar usuarios/negocios
-- reportados) and the audit fields needed to block a reported User (Business
-- already had an equivalent suspension mechanism from HU-8.4).
-- Rollback:
--   DROP TABLE "reports";
--   DROP TYPE "ReportStatus";
--   DROP TYPE "ReportedEntityType";
--   ALTER TABLE "users" DROP COLUMN "isBlocked", DROP COLUMN "blockedByUserId", DROP COLUMN "blockedAt", DROP COLUMN "blockReason";

CREATE TYPE "ReportedEntityType" AS ENUM ('USER', 'BUSINESS');
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'SUSPENDED', 'DISMISSED');

ALTER TABLE "users"
  ADD COLUMN "isBlocked"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "blockedByUserId" TEXT,
  ADD COLUMN "blockedAt"       TIMESTAMP(3),
  ADD COLUMN "blockReason"     TEXT;

CREATE TABLE "reports" (
  "id"               TEXT NOT NULL,
  "reportedType"     "ReportedEntityType" NOT NULL,
  "reportedId"       TEXT NOT NULL,
  "reason"           TEXT NOT NULL,
  "reportedByUserId" TEXT NOT NULL,
  "status"           "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "internalNote"     TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports_reportedType_reportedId_idx" ON "reports"("reportedType", "reportedId");
CREATE INDEX "reports_reportedByUserId_idx" ON "reports"("reportedByUserId");
CREATE INDEX "reports_status_idx" ON "reports"("status");
