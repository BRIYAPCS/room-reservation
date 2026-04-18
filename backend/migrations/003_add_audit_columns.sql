-- Migration 003 — Add audit columns for OTP-verified edits
-- Run once against the production database before deploying the matching backend build.
--
-- last_verified_edit_at    — timestamp of the most recent OTP-verified edit
-- last_verified_edit_email — email address used in that OTP verification

ALTER TABLE reservations
  ADD COLUMN last_verified_edit_at    DATETIME     NULL AFTER created_device_session_id,
  ADD COLUMN last_verified_edit_email VARCHAR(254) NULL AFTER last_verified_edit_at;
