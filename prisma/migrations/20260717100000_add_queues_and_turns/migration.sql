-- Migration: add_queues_and_turns
-- Reconstructed from the live schema already applied on the Render database
-- (this .sql file was never committed to the repo; the migration itself was
-- applied there manually at some point, so `prisma migrate deploy` fails
-- with P3015 on any environment that doesn't already have it — including a
-- fresh local Postgres, CI, or a new clone). Verified column types, defaults,
-- FK delete/update rules and indexes against information_schema/pg_indexes
-- on the real database before writing this file.

CREATE TYPE "TurnStatus" AS ENUM ('WAITING', 'CALLED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "TurnPriority" AS ENUM ('ARRIVED', 'PHYSICAL', 'IN_TRANSIT', 'REGISTERED');
CREATE TYPE "TurnSource" AS ENUM ('APP', 'MANUAL', 'QR', 'WEB');

CREATE TABLE "queues" (
    "id"        TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "prefix"    TEXT NOT NULL DEFAULT 'A',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "turns" (
    "id"            TEXT NOT NULL,
    "queueId"       TEXT NOT NULL,
    "businessId"    TEXT NOT NULL,
    "customerId"    TEXT,
    "guestName"     TEXT,
    "number"        INTEGER NOT NULL,
    "displayNumber" TEXT NOT NULL,
    "status"        "TurnStatus" NOT NULL DEFAULT 'WAITING',
    "priority"      "TurnPriority" NOT NULL DEFAULT 'REGISTERED',
    "source"        "TurnSource" NOT NULL DEFAULT 'APP',
    "turnDate"      TIMESTAMP(3) NOT NULL,
    "calledAt"      TIMESTAMP(3),
    "attendedAt"    TIMESTAMP(3),
    "cancelledAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "queues_businessId_idx" ON "queues"("businessId");

CREATE INDEX "turns_queueId_status_idx" ON "turns"("queueId", "status");
CREATE INDEX "turns_customerId_status_idx" ON "turns"("customerId", "status");
CREATE INDEX "turns_businessId_turnDate_idx" ON "turns"("businessId", "turnDate");

ALTER TABLE "queues"
ADD CONSTRAINT "queues_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "turns"
ADD CONSTRAINT "turns_queueId_fkey"
FOREIGN KEY ("queueId") REFERENCES "queues"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "turns"
ADD CONSTRAINT "turns_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "turns"
ADD CONSTRAINT "turns_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
