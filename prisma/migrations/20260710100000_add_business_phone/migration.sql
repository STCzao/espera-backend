-- Migration: add_business_phone
-- Adds optional contact phone number to businesses.
-- Rollback: ALTER TABLE businesses DROP COLUMN phone;

ALTER TABLE businesses ADD COLUMN phone TEXT;
