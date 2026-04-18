-- Migration 002 — Create reservation_otps table for cross-device edit verification
-- Run once against the production database before deploying the matching backend build.
--
-- Each row represents one OTP issuance for a specific reservation + email pair.
-- Rules enforced by the backend:
--   - expires 10 minutes after creation
--   - max 5 wrong attempts (attempts column)
--   - single use (used flag set to 1 on first successful verify)
--   - previous codes for the same reservation are invalidated (used=1) on new request

CREATE TABLE IF NOT EXISTS reservation_otps (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reservation_id    INT           NOT NULL,
  email             VARCHAR(254)  NOT NULL,
  otp_hash          VARCHAR(64)   NOT NULL  COMMENT 'HMAC-SHA256(otp:reservation_id, JWT_SECRET)',
  expires_at        DATETIME      NOT NULL,
  attempts          TINYINT       NOT NULL  DEFAULT 0,
  used              TINYINT(1)    NOT NULL  DEFAULT 0,
  created_at        DATETIME      NOT NULL  DEFAULT CURRENT_TIMESTAMP,

  KEY idx_reservation_email (reservation_id, email),
  KEY idx_expires_at        (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional cleanup job (run periodically via cron or event scheduler):
-- DELETE FROM reservation_otps WHERE expires_at < NOW() - INTERVAL 1 DAY;
