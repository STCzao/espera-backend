-- Migration: add_phone_reservation_channel
-- Adds "phone" as a Turn entry channel (HU-4.5 pilot): a staff member takes
-- a reservation over a phone call/WhatsApp, without the customer being
-- physically present. Distinct from "manual" (walk-in, staff enters it while
-- the person is standing there — keeps its "physical" priority).
-- Rollback:
--   ALTER TABLE "turns" DROP COLUMN "phone";
--   ALTER TYPE "TurnSource" RENAME TO "TurnSource_old";
--   CREATE TYPE "TurnSource" AS ENUM ('APP', 'MANUAL', 'QR', 'WEB');
--   ALTER TABLE "turns" ALTER COLUMN source TYPE "TurnSource" USING source::text::"TurnSource";
--   DROP TYPE "TurnSource_old";

ALTER TYPE "TurnSource" ADD VALUE 'PHONE';

ALTER TABLE "turns"
ADD COLUMN "phone" TEXT;
