-- Migration: unique_active_turn_per_customer
-- CreateTurnUseCase's "customer doesn't already have an active turn" check
-- (findActiveByCustomerInAnyBusiness, then a separate createWithNextNumber)
-- has a read-then-write race: two concurrent turn requests for the same
-- customer (e.g. a double-tap, or two devices) can both read "no active
-- turn" before either writes, ending up with two simultaneous active turns
-- for the same customer at once — across any business, since the invariant
-- is system-wide by design (confirmed 2026-09-18), not per-business. A
-- partial unique index makes the database reject the second insert instead
-- of silently allowing the collision — same pattern as
-- 20260820000000_unique_active_turn_per_service_window and
-- 20260918000000_unique_active_qr_per_business.
--
-- customerId IS NOT NULL is explicit documentation, not strictly required:
-- Postgres unique indexes already never consider two NULLs equal, so guest
-- turns (customerId null) were never at risk of colliding here regardless.
--
-- Rollback:
--   DROP INDEX "turns_active_customer_unique";

CREATE UNIQUE INDEX "turns_active_customer_unique"
ON "turns" ("customerId")
WHERE "status" IN ('WAITING', 'CALLED', 'ATTENDING', 'REDIRECTED') AND "customerId" IS NOT NULL;
