CREATE TYPE "BusinessOperationalStatus" AS ENUM ('NORMAL', 'DELAYED', 'PAUSED', 'CLOSED');

ALTER TABLE "businesses"
ADD COLUMN "operationalStatus" "BusinessOperationalStatus" NOT NULL DEFAULT 'NORMAL';
