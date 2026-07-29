-- Migration: service_windows
-- Adds ServiceWindow entity and links turns to their assigned window.
-- Rollback:
--   ALTER TABLE turns DROP COLUMN "serviceWindowId";
--   DROP TABLE service_windows;
--   DROP TYPE "ServiceWindowType";

CREATE TYPE "ServiceWindowType" AS ENUM ('STANDARD', 'PRIORITY', 'SPECIALIZED');

CREATE TABLE "service_windows" (
    "id"        TEXT NOT NULL,
    "queueId"   TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      "ServiceWindowType" NOT NULL DEFAULT 'STANDARD',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_windows_queueId_idx" ON "service_windows"("queueId");

ALTER TABLE "service_windows" ADD CONSTRAINT "service_windows_queueId_fkey"
    FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "turns" ADD COLUMN "serviceWindowId" TEXT;

ALTER TABLE "turns" ADD CONSTRAINT "turns_serviceWindowId_fkey"
    FOREIGN KEY ("serviceWindowId") REFERENCES "service_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
