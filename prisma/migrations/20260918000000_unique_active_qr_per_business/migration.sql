-- Migration: unique_active_qr_per_business
-- GetBusinessQrCodeUseCase's occupancy check (findActiveByBusinessId, then a
-- separate save when none exists) has a read-then-write race: two
-- concurrent first-time requests (e.g. two tabs loading the panel right
-- after approval) can both read "no active QR" before either writes, ending
-- up with two ACTIVE QR codes for the same business at once. A partial
-- unique index makes the database reject the second write instead of
-- silently allowing the collision — same pattern as
-- 20260820000000_unique_active_turn_per_service_window.
--
-- RETIRING QR codes are explicitly excluded (see RegenerateBusinessQrCodeUseCase:
-- "Only one QR should be active for the panel, but retiring QR codes can
-- still resolve during the transition window") — several can coexist while
-- transitioning, only ACTIVE is exclusive.
--
-- Rollback:
--   DROP INDEX "business_qr_codes_active_unique";

CREATE UNIQUE INDEX "business_qr_codes_active_unique"
ON "business_qr_codes" ("businessId")
WHERE "status" = 'ACTIVE';
