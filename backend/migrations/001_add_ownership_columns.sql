-- Migration 001 — Add ownership tracking columns to reservations
-- Run once against the production database before deploying the matching backend build.
--
-- ownership_type: 'email' | 'device'
--   email  → booking is tied to a verified @briya.org email address
--   device → booking is tied to a device session ID (localStorage UUID)
--
-- NULL in any column = legacy row created before ownership tracking.
-- The PUT /api/events/:siteCode/:roomId/:eventId handler falls back to
-- name-based ownership for these rows to stay backward-compatible.

ALTER TABLE reservations
  ADD COLUMN owner_email               VARCHAR(254) NULL AFTER all_day,
  ADD COLUMN ownership_type            VARCHAR(10)  NULL AFTER owner_email,
  ADD COLUMN created_device_session_id VARCHAR(128) NULL AFTER ownership_type;

-- Optional index for future queries filtering by email owner
CREATE INDEX idx_reservations_owner_email ON reservations (owner_email);
