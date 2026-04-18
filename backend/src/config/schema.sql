-- Run once: mysql -u root -p briya_reservations < src/config/schema.sql
--
-- If upgrading an existing DB, run this migration manually:
--   ALTER TABLE reservations
--     ADD COLUMN recurrence_group_id VARCHAR(150) DEFAULT NULL,
--     ADD COLUMN recurrence_index    INT          DEFAULT 0,
--     ADD COLUMN all_day             TINYINT(1)   DEFAULT 0;
--   CREATE INDEX idx_recurrence_group ON reservations (recurrence_group_id);

CREATE TABLE IF NOT EXISTS sites (
  id         VARCHAR(100) PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  image      TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  id         VARCHAR(100) NOT NULL,
  site_id    VARCHAR(100) NOT NULL REFERENCES sites(id),
  name       VARCHAR(255) NOT NULL,
  capacity   INT DEFAULT 0,
  image      TEXT,
  PRIMARY KEY (site_id, id)
);

CREATE TABLE IF NOT EXISTS reservations (
  id               VARCHAR(150) PRIMARY KEY,
  site_id          VARCHAR(100) NOT NULL,
  room_id          VARCHAR(100) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  raw_title        VARCHAR(255),
  booked_by        VARCHAR(255),
  description      TEXT,
  start_time       DATETIME NOT NULL,
  end_time         DATETIME NOT NULL,
  background_color VARCHAR(20)  DEFAULT '#4abfce',
  border_color     VARCHAR(20)  DEFAULT '#3aaebe',
  last_edited_by      VARCHAR(255),
  last_edited_at      DATETIME,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  recurrence_group_id VARCHAR(150) DEFAULT NULL,
  recurrence_index    INT          DEFAULT 0,
  all_day             TINYINT(1)   DEFAULT 0
);
