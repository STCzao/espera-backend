-- Migration: unique_active_turn_per_service_window
-- The application-level occupancy check in AttendTurnUseCase
-- (findAttendingByServiceWindow, then a separate save) has a read-then-write
-- race: two concurrent "attend" calls targeting the same service window can
-- both read "free" before either writes, ending up with two turns
-- ATTENDING/REDIRECTED on the same window at once. A partial unique index
-- makes the database reject the second write instead of silently allowing
-- the collision — the application check stays as a fast, friendlier error
-- for the common (non-racing) case.
-- Rollback:
--   DROP INDEX "turns_active_service_window_unique";

CREATE UNIQUE INDEX "turns_active_service_window_unique"
ON "turns" ("serviceWindowId")
WHERE "status" IN ('ATTENDING', 'REDIRECTED');
