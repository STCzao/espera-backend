-- Migration: subscription_manual_management
-- Adds audit fields so the Backoffice can manually activate/cancel a
-- Subscription (there is no payment gateway in the MVP — status transitions
-- are driven by the Espera team confirming payment out-of-band).
-- cancelledAt/cancellationReason already existed; this adds who did it plus
-- the activation counterpart.
-- Rollback:
--   ALTER TABLE "subscriptions" DROP COLUMN "activatedByUserId", DROP COLUMN "activatedAt", DROP COLUMN "cancelledByUserId";

ALTER TABLE "subscriptions"
  ADD COLUMN "activatedByUserId" TEXT,
  ADD COLUMN "activatedAt"       TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT;
