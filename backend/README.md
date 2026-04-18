# Briya API — Backend

Node.js/Express REST API for the Briya Public Charter School room reservation system. Hosted on a Linode VPS (Ubuntu 22.04), managed by PM2 in cluster mode, and served behind an Nginx reverse proxy with HTTPS (Let's Encrypt).

**Frontend:** `https://briyapcs.github.io/room-reservation/`  
**API base (production):** `https://briya-api.duckdns.org/api`  
**Health check:** `https://briya-api.duckdns.org/api/health`

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Authentication & Roles](#authentication--roles)
- [Email Verification & OTP System](#email-verification--otp-system)
- [Session Revocation](#session-revocation)
- [Rate Limiting](#rate-limiting)
- [Audit Logging](#audit-logging)
- [API Reference](#api-reference)
- [Configuration System](#configuration-system)
- [Database Schema](#database-schema)
- [File Attachments](#file-attachments)
- [Weather Proxy](#weather-proxy)
- [Visitor Counter](#visitor-counter)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [PM2 Process Manager](#pm2-process-manager)
- [Nginx Configuration](#nginx-configuration)

---

## Features

- **JWT authentication** with three roles: standard, admin, superadmin
- **PIN-based login** with SHA-256 + secret hashing (PINs never stored in plaintext)
- **Email OTP login** via Resend transactional email — mandatory for admin/superadmin, optional for standard
- **Trusted device fast-login** — verified devices bypass OTP on subsequent logins (90-day TTL)
- **Cross-device session revocation** — "Sign out all devices" stamps `last_logout_at`; all tokens issued before that timestamp are invalidated on next use
- **Session validity endpoint** — lightweight `GET /auth/session` used by frontend to poll for forced logouts within 30 seconds
- **Sites and rooms CRUD** with drag-to-reorder support
- **Reservations** — create, edit, delete single events and recurring series (this / this & following / all)
- **Recurring series** — grouped by `recurrence_group_id`, each occurrence individually addressable by `recurrence_index`
- **Ownership enforcement** — `enforceOwnership()` in events.js is the single source of truth for edit/delete authorization
- **Config API** — superadmin toggles feature flags at runtime; written to `config_overrides.json`; takes effect immediately
- **File attachments** — per-reservation upload (PDF, Office, images); multer diskStorage with crypto-random filenames; 20 MB limit
- **Weather proxy** — Open-Meteo + OpenStreetMap geocoding; server-side 10-minute cache; WMO code mapping
- **Live visitor counter** — MySQL-backed session tracking with 90-second stale threshold
- **Audit logging** — fire-and-forget DB writes for 15+ event types
- **Rate limiting** — tiered limits (global, PIN, OTP request, OTP verify); only failed requests count toward limits (`skipSuccessfulRequests: true`)
- **Security headers** — Helmet.js; `trust proxy` set for Nginx; CORS origin allowlist
- **Compression** — gzip/brotli via `compression` middleware
- **PM2 cluster mode** — 2 worker processes; zero-downtime rolling restart

---

## Tech Stack

| Layer | Library / Tool | Version |
|---|---|---|
| Runtime | Node.js (ESM modules) | 20 |
| Framework | Express | 4.19.2 |
| Database | MySQL 8 via `mysql2/promise` | 3.20.0 |
| Auth | `jsonwebtoken` | 9.0.3 |
| Email | `resend` | 6.11.0 |
| File uploads | `multer` | 2.1.1 |
| Rate limiting | `express-rate-limit` | 8.3.2 |
| Security | `helmet` | 8.0.0 |
| CORS | `cors` | 2.8.5 |
| Compression | `compression` | 1.7.4 |
| Process manager | PM2 | (global install) |
| Reverse proxy | Nginx + Let's Encrypt / Certbot | — |

---

## Project Structure

```
backend/
├── data/
│   └── config_overrides.json       # Runtime config written by PUT /api/config
│                                   # Auto-created on first admin dashboard save
├── uploads/
│   └── images/                     # Reservation file attachments (crypto-named)
│       ├── Sites/                  # Site card images (WebP)
│       └── Rooms/                  # Room card images (WebP, per-site subfolder)
├── src/
│   ├── config/
│   │   └── db.js                   # MySQL connection pool (20 connections, 60s idle timeout)
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT decode + session revocation check
│   │   ├── rateLimiter.js          # All rate limiter instances
│   │   ├── requireAdmin.js         # 403 if role is not admin or superadmin
│   │   └── requireSuperAdmin.js    # 403 if role is not superadmin
│   ├── routes/
│   │   ├── auth.js                 # All auth endpoints (login, OTP, trusted device, session)
│   │   ├── sites.js                # Site CRUD + reorder
│   │   ├── rooms.js                # Room CRUD + reorder
│   │   ├── reservations.js         # Event list (public-facing alias)
│   │   ├── events.js               # Event create/edit/delete (single + recurring series)
│   │   ├── attachments.js          # File upload/download/delete per reservation
│   │   ├── config.js               # GET (public) + PUT (superadmin) config flags
│   │   ├── weather.js              # Open-Meteo proxy with server-side caching
│   │   └── visitors.js             # Active session heartbeat + count
│   ├── services/
│   │   ├── auditLog.js             # Fire-and-forget audit log DB writes
│   │   └── emailService.js         # Resend integration; login OTP + edit OTP emails
│   ├── utils/
│   │   ├── jwt.js                  # signToken(), signTokenWith(), verifyToken()
│   │   └── envReader.js            # readEnv() — reads .env from disk (hot-reload without restart)
│   └── server.js                   # Express bootstrap: middleware, routes, static files
├── .env.example                    # Template with every required variable
├── ecosystem.config.cjs            # PM2 cluster config (2 instances, 300MB memory limit)
└── package.json                    # ESM, Node 20+
```

---

## Authentication & Roles

### PIN Login

```
POST /api/auth/verify
Body: { pin, name, email?, emailClaimToken?, deviceSessionId? }
```

1. The submitted PIN is hashed with `SHA-256 + JWT_SECRET` and compared against the hashed values of `PIN_STANDARD`, `PIN_ADMIN`, `PIN_SUPERADMIN` from `.env`
2. Matching role is determined; if no role matches, returns 401
3. If an `emailClaimToken` is provided (from a completed OTP flow), the server verifies it and sets `emailVerified: true` in the JWT payload
4. A 24-hour JWT is signed and returned containing: `{ role, name, email, emailVerified, deviceSessionId, iat, exp }`
5. If `emailVerified`, the device is added to `trusted_devices` (or TTL refreshed if existing)

### JWT Payload

```json
{
  "role": "standard",
  "name": "Jane Smith",
  "email": "jsmith@briya.org",
  "emailVerified": true,
  "deviceSessionId": "uuid-...",
  "iat": 1720000000,
  "exp": 1720086400
}
```

`emailVerified` is **only ever set server-side** by verifying the `emailClaimToken`. The frontend never self-asserts this field.

### Role Capabilities

| Role | PIN source | Create events | Edit/delete own events | Edit/delete any event | Site/room management | Config API |
|---|---|---|---|---|---|---|
| standard | `PIN_STANDARD` | Yes | Yes (future only) | No | No | No |
| admin | `PIN_ADMIN` | Yes | Yes | Yes | No | No |
| superadmin | `PIN_SUPERADMIN` | Yes | Yes | Yes | Yes | Yes |

### Ownership Enforcement (`enforceOwnership()` in events.js)

Single source of truth for edit/delete authorization. Called on every PUT and DELETE request.

Decision tree:
1. **Superadmin or admin** → `allowed` immediately
2. **Standard, `ownershipType === 'device'`** → `allowed` if `req.user.deviceSessionId === row.created_device_session_id`
3. **Standard, `ownershipType === 'email'`**:
   - If `req.user.emailVerified === true` AND `req.user.email === row.owner_email` → `allowed` (any device)
   - If a valid OTP `editToken` was supplied and its email matches `row.owner_email` → `allowed`
   - Otherwise → `blocked`
4. Ended events (past `end_time`) → `blocked` for standard users regardless

This design means an email-verified user can edit their bookings from any device without a second OTP.

---

## Email Verification & OTP System

### Tables Auto-Created on Startup

`auth.js` runs `CREATE TABLE IF NOT EXISTS` on startup for:
- `trusted_devices` — stores `(email, device_session_id, user_agent, ip_hash, expires_at)`
- `login_otps` — stores hashed OTP codes with expiry, attempt counter, and claim token
- `users` — minimal table for session revocation (`email PK, last_logout_at`)

### OTP Flow Endpoints

| Endpoint | Rate limiter | Description |
|---|---|---|
| `POST /api/auth/check-trusted` | None | Returns `{ trusted: boolean }`. Checks `trusted_devices`. Fast probe before hitting OTP rate limits. |
| `POST /api/auth/request-login-otp` | `otpRequestLimiter` + `otpRequestEmailLimiter` | Generates 6-digit code, HMAC-SHA256 hashes it, stores in `login_otps`, sends email via Resend |
| `POST /api/auth/verify-login-otp` | `otpVerifyLimiter` | Verifies submitted code against HMAC hash, checks expiry + attempt count. Returns `{ ok, emailClaimToken }` on success |
| `POST /api/auth/verify` | `pinLimiter` | PIN login; accepts `emailClaimToken` to issue a `emailVerified=true` JWT |
| `GET /api/auth/session` | None | Returns `{ ok: true }` if token valid; 401 if revoked/expired. Used for cross-device logout detection |
| `POST /api/auth/logout-all` | None (requires auth) | Stamps `last_logout_at = NOW()` in `users` table; deletes all trusted devices for that email |
| `POST /api/auth/validate-email` | None | Calls Power Automate webhook to look up `@briya.org` email; returns `{ valid, name }` |

### Trusted Device Logic (`isTrustedDevice()`)

```
SELECT from trusted_devices WHERE email = ? AND device_session_id = ? AND expires_at > NOW()
```

- **Hard check:** `stored_user_agent === req.headers['user-agent']` (rows without stored UA are grandfathered)
- **Soft check:** IP hash mismatch is logged as a warning but does not reject (users on mobile networks have changing IPs)
- Returns `{ trusted: boolean, reason: string }` — reason is logged for debugging

### OTP Email (`emailService.js`)

- Uses the **Resend** SDK (`RESEND_API_KEY`)
- HTML email template with Briya branding, 6-digit code in a monospace `<code>` block, expiry reminder
- Falls back to `console.log` in development (if `RESEND_API_KEY` is not set)
- Never throws — email failures do not block the API response

### Admin/Superadmin: Email OTP Is Mandatory

The frontend enforces this (email required field + hidden skip/bypass buttons), and the JWT payload confirms it on every request. The backend's `enforceOwnership()` uses `emailVerified` from the JWT to grant cross-device edit access, making it both a security requirement and a feature enabler.

---

## Session Revocation

### How It Works

1. `POST /api/auth/logout-all` is called (requires a valid Bearer token for the user's email)
2. Inserts/updates `users` table: `INSERT INTO users ... ON DUPLICATE KEY UPDATE last_logout_at = NOW()`
3. Deletes all rows in `trusted_devices` for that email
4. The calling device's local session is then cleared by the frontend

### How Tokens Are Invalidated

`authMiddleware.js` checks revocation only for email-verified sessions (the only ones tracked in `users`):

```js
if (req.user.emailVerified && req.user.email) {
  const row = await db.query('SELECT last_logout_at FROM users WHERE email = ?', [email])
  if (row && row.last_logout_at) {
    const logoutAt = new Date(row.last_logout_at).getTime() / 1000
    if (payload.iat < logoutAt) return res.status(401).json({ error: 'Session revoked' })
  }
}
```

Tokens issued before `last_logout_at` are rejected. DB errors during this check fail open (do not block the request) to prevent outages from locking out users.

### Cross-Device Notification (30-second window)

Other active sessions poll `GET /api/auth/session` every 30 seconds. This endpoint runs `authMiddleware` which performs the revocation check. A 401 response triggers the frontend's `ForcedLogoutBanner`.

---

## Rate Limiting

All limiters use `skipSuccessfulRequests: true` — **only failed requests count toward the limit**. This means a user who successfully sends an OTP or logs in never burns rate limit quota.

| Limiter | Window | Max failures | Applied to |
|---|---|---|---|
| `globalLimiter` | 1 minute | 300 | All endpoints (skips `/api/health`) |
| `pinLimiter` | 1 minute | 5 | `POST /api/auth/verify` |
| `otpRequestLimiter` | 10 minutes | 3 | `POST /api/auth/request-login-otp` (by IP) |
| `otpRequestEmailLimiter` | 1 hour | 5 | `POST /api/auth/request-login-otp` (by email) |
| `otpVerifyLimiter` | 10 minutes | 10 | `POST /api/auth/verify-login-otp` (by IP) |
| `eventWriteLimiter` | 1 minute | 60 | All event create/edit/delete endpoints |

Rate limit errors return a structured JSON body with a machine-readable `code` field:
```json
{ "error": "Too many OTP requests. Please wait before requesting another code.", "code": "OTP_REQUEST_IP" }
```

The `requireBriyaEmail` middleware validates that submitted emails end with `@briya.org` and writes an audit log entry on rejection.

---

## Audit Logging

`src/services/auditLog.js` provides a `writeAuditLog()` function that writes fire-and-forget `INSERT` queries to the `audit_logs` table. It never throws — audit failures must not block the main request flow.

### Event Types (`ACTION_TYPES`)

| Code | Triggered when |
|---|---|
| `LOGIN` | Successful PIN login |
| `LOGIN_FAILED` | Wrong PIN submitted |
| `OTP_REQUESTED` | Login OTP email sent |
| `OTP_VERIFIED` | Login OTP verified successfully |
| `OTP_FAILED` | Wrong OTP code submitted |
| `OTP_RATE_LIMIT_HIT` | OTP rate limit triggered |
| `TRUSTED_DEVICE_LOGIN` | Trusted device bypass used |
| `LOGOUT_ALL` | Sign out all devices triggered |
| `RESERVATION_CREATED` | New booking created |
| `RESERVATION_UPDATED` | Booking edited |
| `RESERVATION_DELETED` | Booking deleted |
| `SERIES_UPDATED` | Recurring series edited |
| `SERIES_DELETED` | Recurring series deleted |
| `EMAIL_DOMAIN_REJECTED` | Non-@briya.org email attempted |
| `SESSION_CHECK` | Session validity probe |

Each record stores: `action_type`, `reservation_id` (nullable), `user_email`, `device_session_id`, `metadata` (JSON), `created_at`.

---

## API Reference

All endpoints are prefixed with `/api`. Authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/verify` | None | PIN login → JWT |
| POST | `/auth/check-trusted` | None | Probe if device is trusted (not rate-limited) |
| POST | `/auth/request-login-otp` | None | Send 6-digit login OTP to @briya.org email |
| POST | `/auth/verify-login-otp` | None | Verify OTP code → emailClaimToken |
| POST | `/auth/validate-email` | None | Look up @briya.org email via Power Automate |
| GET  | `/auth/session` | Required | Lightweight session validity probe (revocation check) |
| POST | `/auth/logout-all` | Required | Revoke all sessions for this email |
| GET  | `/health` | None | Server health check |

**POST `/auth/verify`**
```json
// Request
{ "pin": "1234", "name": "Jane Smith", "email": "jsmith@briya.org", "emailClaimToken": "eyJ...", "deviceSessionId": "uuid-..." }

// Response
{ "token": "<24h JWT>", "role": "standard", "name": "Jane Smith", "email": "jsmith@briya.org", "emailVerified": true }
```

**POST `/auth/request-login-otp`**
```json
// Request
{ "email": "jsmith@briya.org", "deviceSessionId": "uuid-..." }

// Response (untrusted device)
{ "ok": true, "maskedEmail": "js***@briya.org", "name": "Jane Smith" }

// Response (trusted device — no email sent)
{ "trusted": true }
```

**POST `/auth/verify-login-otp`**
```json
// Request
{ "email": "jsmith@briya.org", "otp": "481923", "deviceSessionId": "uuid-..." }

// Response
{ "ok": true, "emailClaimToken": "eyJ..." }
```

---

### Sites

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sites` | None | List all active sites (cached 60s + 300s CDN) |
| POST | `/sites` | Superadmin | Create new site |
| PUT | `/sites/reorder` | Superadmin | Batch update sort order |
| GET | `/sites/:siteCode` | None | Get single site + all its rooms |
| PUT | `/sites/:siteCode` | Superadmin | Update name/code |
| DELETE | `/sites/:siteCode` | Superadmin | Soft-delete (sets `is_active = 0`) |

Auto-generates `site_code` from the name if not provided (e.g., "Fort Totten" → `FORT_TOTTEN`). Checks for duplicate codes on update.

---

### Rooms

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/rooms/:siteCode` | None | List rooms for a site (cached 60s + 300s CDN) |
| POST | `/rooms/:siteCode` | Superadmin | Create new room |
| PUT | `/rooms/reorder/:siteCode` | Superadmin | Batch update sort order |
| PUT | `/rooms/:siteCode/:roomId` | Superadmin | Update name/capacity |
| DELETE | `/rooms/:siteCode/:roomId` | Superadmin | Soft-delete |

Auto-generates `room_code` with numeric suffix if duplicate (e.g., `ROOM`, `ROOM_2`, `ROOM_3`). Max 20 chars, uppercase, underscores only. The reorder route is defined before `/:siteCode/:roomId` to avoid Express path conflicts.

---

### Reservations (Public Alias)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reservations/:siteCode/:roomId` | None | List all events for a room |

Returns FullCalendar-compatible event objects. Supports optional `?from=` and `?to=` ISO date query params.

**Response shape per event:**
```json
{
  "id": 42,
  "title": "Weekly Staff Meeting",
  "start": "2025-09-01T09:00:00",
  "end": "2025-09-01T10:00:00",
  "allDay": false,
  "extendedProps": {
    "bookedBy": "Jane Smith",
    "description": "<p>Agenda attached</p>",
    "ownerEmail": "jsmith@briya.org",
    "ownershipType": "email",
    "deviceSessionId": "uuid-...",
    "recurrenceGroupId": "rg-abc123",
    "recurrenceIndex": 2,
    "createdAt": "2025-08-15T14:30:00"
  }
}
```

---

### Events

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/events/:siteCode/:roomId` | Standard+ | Create one or more events (accepts array) |
| PUT | `/events/:siteCode/:roomId/:eventId` | Standard+ | Update a single event |
| DELETE | `/events/:siteCode/:roomId/:eventId` | Standard+ | Delete a single event |
| PUT | `/events/:siteCode/:roomId/group/:groupId` | Standard+ | Edit recurring series (`?scope=this\|following\|all&fromIndex=N`) |
| DELETE | `/events/:siteCode/:roomId/group/:groupId` | Standard+ | Delete recurring series (same scope params) |
| POST | `/events/:siteCode/:roomId/:eventId/request-otp` | None | Send cross-device edit OTP |
| POST | `/events/:siteCode/:roomId/:eventId/verify-otp` | None | Verify cross-device edit OTP → editToken |
| POST | `/events/:siteCode/:roomId/:eventId/claim-request-otp` | None | Legacy claim OTP (pre-migration bookings) |
| POST | `/events/:siteCode/:roomId/:eventId/claim-verify-otp` | None | Legacy claim OTP verify |

**Ownership is always extracted from the JWT** — the body `bookedBy`/`email` fields are for display only; they never override `req.user` for authorization decisions.

**Edit token (`X-Edit-Token` header):** Short-lived JWT issued after successful cross-device OTP verification. Accepted instead of (or alongside) `Authorization` for that specific event's PUT/DELETE.

---

### Config

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | None | Merged config (env + overrides) |
| PUT | `/config` | Superadmin | Update boolean flags |

**GET `/config`** response (partial):
```json
{
  "bookingStartHour": 8,
  "bookingEndHour": 21,
  "slotDurationMinutes": 15,
  "enableRecurringEvents": true,
  "requireLoginForCalendar": true,
  "allowDoubleBooking": true,
  "allowPastBookings": false,
  "allowWeekendBookings": false,
  "siteManagementEnabled": true,
  "roomManagementEnabled": true,
  "weatherEnabled": true,
  "visitorCounterEnabled": true,
  "businessStart": "08:00",
  "businessEnd": "17:00",
  "businessDays": "1,2,3,4,5",
  "recurringMaxMonths": 12,
  "canCreateRoles": "superadmin,admin,standard",
  "editOthersRole": "admin",
  "deleteRole": "admin"
}
```

Only keys in the `ALLOWED_KEYS` set in `config.js` can be updated via PUT. Unknown keys are silently ignored.

---

### Weather

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/weather` | None | Current weather (open-meteo + OSM, cached 10 min) |
| GET | `/weather?lat=38.9&lon=-77.0` | None | Weather for specific coordinates |

Returns:
```json
{ "condition": "Partly Cloudy", "temperature": 74, "humidity": 65, "windSpeed": 8, "city": "Washington DC", "icon": "⛅" }
```

---

### Visitors

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/visitors/heartbeat` | None | Register/refresh session (`{ sessionId }`) |
| GET | `/visitors` | None | Returns `{ live: N }` |

Sessions older than 90 seconds are considered stale and excluded. The heartbeat endpoint auto-deletes stale sessions on every call using `INSERT ... ON DUPLICATE KEY UPDATE`.

---

### Attachments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/attachments/:reservationId` | Standard+ | List attachments for a reservation |
| POST | `/attachments/:reservationId` | Standard+ | Upload file (multipart/form-data, field: `file`) |
| GET | `/attachments/file/:id` | None | Stream/download file |
| DELETE | `/attachments/:id` | Standard+ | Delete file + DB record |

Allowed MIME types: `pdf`, `docx`, `xlsx`, `pptx`, `jpg`/`jpeg`, `png`, `gif`, `webp`.  
Max size: 20 MB (enforced by multer; also set as `client_max_body_size 22M` in nginx).  
Files stored in `uploads/` with `crypto.randomBytes(16).toString('hex')` filenames (preserves extension).

---

## Configuration System

Config is built by merging two sources (later wins):

```
.env values  (read via envReader.js — reads from disk on every call, so changes apply without restart)
    ↓ merged with
data/config_overrides.json   (written by PUT /api/config; created on first save)
    ↓
Final config object returned by GET /api/config
```

`envReader.js` reads the `.env` file from disk on every invocation (not cached). This means `.env` changes apply without a server restart.

The admin dashboard writes to `config_overrides.json` which persists across restarts. These overrides survive PM2 restarts because they live on disk.

---

## Database Schema

Database name: `briya_room_reservations` (MySQL 8, timezone forced to `America/New_York`).

```sql
-- Sites (e.g. Fort Totten, Riggs Park)
CREATE TABLE sites (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  site_code  VARCHAR(20)  NOT NULL UNIQUE,
  image_url  VARCHAR(255),
  sort_order INT DEFAULT 0,
  is_active  TINYINT(1) DEFAULT 1
);

-- Rooms within a site
CREATE TABLE rooms (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  site_id    INT NOT NULL REFERENCES sites(id),
  name       VARCHAR(100) NOT NULL,
  room_code  VARCHAR(20)  NOT NULL,
  capacity   INT DEFAULT 0,
  image_url  VARCHAR(255),
  sort_order INT DEFAULT 0,
  is_active  TINYINT(1) DEFAULT 1,
  UNIQUE (room_code, site_id)
);

-- Individual reservations / recurring series occurrences
CREATE TABLE reservations (
  id                          INT AUTO_INCREMENT PRIMARY KEY,
  site_id                     INT NOT NULL,
  room_id                     INT NOT NULL REFERENCES rooms(id),
  title                       VARCHAR(255) NOT NULL,
  description                 TEXT,
  start_time                  DATETIME NOT NULL,
  end_time                    DATETIME NOT NULL,
  all_day                     TINYINT(1) DEFAULT 0,
  created_by_name             VARCHAR(100),
  created_tz                  VARCHAR(60),
  owner_email                 VARCHAR(255),
  ownership_type              ENUM('email','device') DEFAULT 'device',
  created_device_session_id   VARCHAR(128),
  recurrence_group_id         VARCHAR(64),
  recurrence_index            INT DEFAULT 0,
  last_verified_edit_at       DATETIME,
  last_verified_edit_email    VARCHAR(255),
  created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- File attachments per reservation
CREATE TABLE attachments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL REFERENCES reservations(id),
  filename       VARCHAR(255) NOT NULL,   -- crypto-random disk filename
  original_name  VARCHAR(255),            -- original upload filename shown to user
  mime_type      VARCHAR(100),
  file_size      INT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail
CREATE TABLE audit_logs (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  action_type       VARCHAR(60) NOT NULL,
  reservation_id    INT,
  user_email        VARCHAR(255),
  device_session_id VARCHAR(128),
  metadata          JSON,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Auto-created by auth.js on startup
CREATE TABLE IF NOT EXISTS trusted_devices (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(255) NOT NULL,
  device_session_id VARCHAR(128) NOT NULL,
  user_agent        VARCHAR(512),
  ip_hash           VARCHAR(64),
  expires_at        DATETIME NOT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_dsid (email, device_session_id)
);

CREATE TABLE IF NOT EXISTS login_otps (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  email              VARCHAR(255) NOT NULL,
  otp_hash           VARCHAR(128) NOT NULL,
  device_session_id  VARCHAR(128),
  expires_at         DATETIME NOT NULL,
  attempts           INT DEFAULT 0,
  used               TINYINT(1) DEFAULT 0,
  claim_jti          VARCHAR(128),
  claim_token_used   TINYINT(1) DEFAULT 0,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_jti (claim_jti)
);

CREATE TABLE IF NOT EXISTS users (
  email          VARCHAR(255) PRIMARY KEY,
  last_logout_at DATETIME
);

-- Auto-created by visitors.js on startup
CREATE TABLE IF NOT EXISTS visitor_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  last_seen  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## File Attachments

- **Storage:** `uploads/` directory on the VPS (gitignored; uploaded manually via SCP)
- **Filenames:** `crypto.randomBytes(16).toString('hex') + ext` (prevents enumeration)
- **Serving:** Nginx serves `uploads/images/` directly at `/images/` with 7-day cache and `immutable` header. Attachment files are streamed via `GET /api/attachments/file/:id` through Node (sets correct `Content-Type` and `Content-Disposition`)
- **DB metadata:** `original_name`, `mime_type`, `file_size` stored in `attachments` table
- **Deletion:** Removes both the file from disk and the DB row

---

## Weather Proxy

- **Source:** Open-Meteo API (free, no key required) for weather data; OpenStreetMap Nominatim for reverse geocoding
- **Caching:** Server-side in-memory cache, 10-minute TTL — prevents every client hitting the external APIs
- **Fallback:** Uses `WEATHER_LAT`/`WEATHER_LON` from `.env` if no coordinates provided
- **WMO code mapping:** Maps WMO weather codes (0–99) to human-readable labels and emoji icons (e.g., `95` → "Thunderstorm" / `⛈`)
- **Dev override:** `WEATHER_TEST_CONDITION` env var overrides the live condition for testing UI states
- **Toggle:** Disabled by setting `weatherEnabled: false` in config — returns 404

---

## Visitor Counter

- **Session tracking:** Each browser tab gets a UUID session ID (generated once, stored in React state)
- **Heartbeat:** `POST /visitors/heartbeat` upserts a row in `visitor_sessions` using `INSERT ... ON DUPLICATE KEY UPDATE last_seen = NOW()`; also deletes all rows where `last_seen < NOW() - INTERVAL 90 SECOND`
- **Count query:** `SELECT COUNT(*) FROM visitor_sessions WHERE last_seen >= NOW() - INTERVAL 90 SECOND`
- **Toggle:** Disabled by setting `visitorCounterEnabled: false` — returns `{ live: 0 }` without querying DB

---

## Local Development

**Prerequisites:** Node.js 20+, MySQL 8+, npm.

```bash
# Clone the monorepo
git clone https://github.com/BRIYAPCS/room-reservation.git
cd "room-reservation/backend"

# Install dependencies
npm install

# Create the database
mysql -u root -p -e "CREATE DATABASE briya_room_reservations;"
# Tables are created automatically on server startup (auth.js, visitors.js)
# For sites/rooms/reservations, import a seed dump or create them via the API

# Configure environment
cp .env.example .env
# Fill in DB_*, JWT_SECRET, PIN_*, and optionally RESEND_API_KEY

# Start the dev server
npm run dev
# → http://localhost:4000
```

From the monorepo root (runs backend + frontend together):
```bash
npm run dev   # uses concurrently — backend on :4000, frontend on :5173
```

Test the API:
```bash
# Health check
curl http://localhost:4000/api/health

# Get config
curl http://localhost:4000/api/config

# Login
curl -X POST http://localhost:4000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"pin":"YOUR_STANDARD_PIN","name":"Test User"}'
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in every value.

| Variable | Description | Example |
|---|---|---|
| `PORT` | Express listen port | `4000` |
| `NODE_ENV` | Environment type | `production` |
| `APP_TIMEZONE` | MySQL/timestamp timezone | `America/New_York` |
| `FRONTEND_URL` | CORS allowlist (comma-separated) | `https://briyapcs.github.io,https://www.briyaroomreservations.org` |
| `DB_HOST` | MySQL host | `50.116.47.133` or `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `briya` |
| `DB_PASSWORD` | MySQL password | *(secret)* |
| `DB_NAME` | MySQL database name | `briya_room_reservations` |
| `PIN_STANDARD` | Standard user PIN | *(secret)* |
| `PIN_ADMIN` | Admin user PIN | *(secret)* |
| `PIN_SUPERADMIN` | Superadmin PIN | *(secret)* |
| `JWT_SECRET` | 96-char hex secret for JWT HMAC | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `BOOKING_START_HOUR` | Earliest bookable hour (24h) | `8` |
| `BOOKING_END_HOUR` | Latest bookable hour (24h) | `21` |
| `SLOT_DURATION_MINUTES` | Calendar slot size | `15` |
| `ALLOW_WEEKENDS` | Show weekend columns | `true` |
| `ALLOW_WEEKEND_BOOKINGS` | Allow Sat/Sun bookings | `false` |
| `ALLOW_PAST_BOOKINGS` | Allow past-dated bookings | `false` |
| `ALLOW_DOUBLE_BOOKING` | Allow overlapping bookings | `true` |
| `REQUIRE_LOGIN_FOR_CALENDAR` | Gate calendar behind PIN | `true` |
| `ENABLE_RECURRING_EVENTS` | Enable recurring booking UI | `true` |
| `RECURRING_MAX_MONTHS` | Max months ahead for a series | `12` |
| `BUSINESS_START` | Business hours start | `08:00` |
| `BUSINESS_END` | Business hours end | `17:00` |
| `BUSINESS_DAYS` | Active day indices (0=Sun) | `1,2,3,4,5` |
| `CAN_CREATE_ROLES` | Roles allowed to create events | `superadmin,admin,standard` |
| `EDIT_OTHERS_ROLE` | Min role to edit others' events | `admin` |
| `DELETE_ROLE` | Min role to delete any event | `admin` |
| `WEATHER_ENABLED` | Enable weather widget | `true` |
| `WEATHER_CITY` | Fallback city name for display | `Washington, DC` |
| `WEATHER_LAT` | Fallback latitude | `38.9072` |
| `WEATHER_LON` | Fallback longitude | `-77.0369` |
| `WEATHER_TEST_CONDITION` | Dev override (e.g. `rain`) | *(empty in prod)* |
| `VISITOR_COUNTER_ENABLED` | Enable visitor counter | `true` |
| `RESEND_API_KEY` | Resend transactional email key | *(from resend.com)* |
| `EMAIL_FROM` | Sender address | `Briya Room Reservations <noreply@briya.org>` |
| `OTP_EXPIRATION_MINUTES` | OTP code TTL | `10` |
| `OTP_RESEND_COOLDOWN_SECONDS` | Min seconds between OTP requests | `300` |
| `OTP_MAX_ATTEMPTS` | Max wrong guesses per OTP | `5` |
| `TRUSTED_DEVICE_DAYS` | Device trust window in days | `90` |
| `POWER_AUTOMATE_WEBHOOK_URL` | Email directory lookup webhook | *(blank to skip)* |

---

## PM2 Process Manager

Configuration file: `ecosystem.config.cjs`

```
instances:          2        (cluster mode — 2 workers on a single-core VPS)
exec_mode:          cluster  (PM2 load-balances requests across workers)
max_memory_restart: 300M     (auto-restart if worker exceeds 300 MB)
max_restarts:       10       (back-off protection against crash loops)
```

Common commands:

```bash
pm2 start ecosystem.config.cjs --env production   # First start
pm2 save                                           # Persist across reboots
pm2 status                                         # Process list with CPU/memory
pm2 logs briya-api --lines 100                     # Tail logs
pm2 reload briya-api                               # Zero-downtime rolling restart
pm2 monit                                          # Live dashboard
pm2 flush                                          # Clear accumulated log files
```

---

## Nginx Configuration

Nginx handles HTTPS termination, HTTP→HTTPS redirect, reverse proxying to Node on port 4000, and direct static image serving.

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name briya-api.duckdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name briya-api.duckdns.org;

    ssl_certificate     /etc/letsencrypt/live/briya-api.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/briya-api.duckdns.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    client_max_body_size 22M;   # matches 20MB multer limit + overhead

    # Static images served by nginx (faster than Node; 7-day cache)
    location /images/ {
        alias /home/briya/briya-api/uploads/images/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";   # required for cross-origin image load
        access_log off;
    }

    # All other traffic → PM2/Node
    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

SSL auto-renewal via Certbot systemd timer (installed automatically by Certbot):
```bash
sudo certbot renew --dry-run   # test renewal
sudo systemctl status certbot.timer   # verify timer is active
```

---

*Designed & Engineered by the Briya IT Team · © 2025 Briya Public Charter School*
