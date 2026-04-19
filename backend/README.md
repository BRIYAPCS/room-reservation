# Briya API — Backend

Node.js/Express REST API for the Briya Public Charter School room reservation system. Hosted on a Linode VPS (Ubuntu 22.04), managed by PM2 in cluster mode, and served behind an Nginx reverse proxy with HTTPS (Let's Encrypt).

**Frontend:** `https://briyapcs.github.io/briya-room-reservation-v2/`
**API base (production):** `https://briya-api.duckdns.org/api`
**Health check:** `https://briya-api.duckdns.org/api/health`
**GitHub repo:** `https://github.com/BRIYAPCS/briya-room-reservation-v2`
**Server folder:** `/home/briya/Briya-Backend-Room-Reservation/`
**PM2 process name:** `Briya-Backend-Room-Reservation`

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
- **Rate limiting** — tiered limits (global, PIN, OTP request, OTP verify); only failed requests count toward limits (`skipSuccessfulRequests: true`); IPv6-safe via `ipKeyGenerator` helper
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
│   └── images/                     # Site and room card images (WebP)
│       ├── Sites/                  # Site card images
│       └── Rooms/                  # Room card images (per-site subfolder)
├── src/
│   ├── config/
│   │   └── db.js                   # MySQL connection pool (UTC timezone, 20 connections, 60s idle timeout)
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT decode + session revocation check
│   │   ├── rateLimiter.js          # All rate limiter instances (IPv6-safe via ipKeyGenerator)
│   │   ├── requireAdmin.js         # 403 if role is not admin or superadmin
│   │   └── requireSuperAdmin.js    # 403 if role is not superadmin
│   ├── routes/
│   │   ├── auth.js                 # All auth endpoints (login, OTP, trusted device, session)
│   │   ├── sites.js                # Site CRUD + reorder
│   │   ├── rooms.js                # Room CRUD + reorder
│   │   ├── reservations.js         # Event list (public-facing alias)
│   │   ├── events.js               # Event create/edit/delete (single + recurring series)
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
├── migrations/
│   ├── 001_add_ownership_columns.sql
│   ├── 002_add_otp_table.sql
│   └── 003_add_audit_columns.sql
├── .env                            # Secret config — gitignored, never committed
├── .env.example                    # Template with every required variable (safe to commit)
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
| superadmin | `PIN_SUPER_ADMIN` | Yes | Yes | Yes | Yes | Yes |

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

> **Power Automate webhook:** The `POWER_AUTOMATE_WEBHOOK_URL` in `.env` must be the **full URL** including all query parameters (`api-version`, `sp`, `sv`, `sig`). Copy it directly from Power Automate or Postman. Without the `sig` signature parameter the webhook returns `valid: false`.

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

Tokens issued before `last_logout_at` are rejected. DB errors during this check fail open to prevent outages.

---

## Rate Limiting

All limiters use `skipSuccessfulRequests: true` — **only failed requests count toward the limit**. The email-keyed limiter (`otpRequestEmailLimiter`) uses `ipKeyGenerator(req)` as the IP fallback to correctly handle IPv6 addresses.

| Limiter | Window | Max failures | Applied to |
|---|---|---|---|
| `globalLimiter` | 1 minute | 300 | All endpoints (skips `/api/health`) |
| `pinLimiter` | 1 minute | 5 | `POST /api/auth/verify` |
| `otpRequestLimiter` | 10 minutes | 3 | `POST /api/auth/request-login-otp` (by IP) |
| `otpRequestEmailLimiter` | 1 hour | 5 | `POST /api/auth/request-login-otp` (by email) |
| `otpVerifyLimiter` | 10 minutes | 10 | `POST /api/auth/verify-login-otp` (by IP) |
| `eventWriteLimiter` | 1 minute | 60 | All event create/edit/delete endpoints |

---

## Audit Logging

`src/services/auditLog.js` provides a `writeAuditLog()` function that writes fire-and-forget `INSERT` queries to the `audit_logs` table.

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

### Sites

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sites` | None | List all active sites |
| POST | `/sites` | Superadmin | Create new site |
| PUT | `/sites/reorder` | Superadmin | Batch update sort order |
| GET | `/sites/:siteCode` | None | Get single site + all its rooms |
| PUT | `/sites/:siteCode` | Superadmin | Update name/code |
| DELETE | `/sites/:siteCode` | Superadmin | Soft-delete (sets `is_active = 0`) |

### Rooms

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/rooms/:siteCode` | None | List rooms for a site |
| POST | `/rooms/:siteCode` | Superadmin | Create new room |
| PUT | `/rooms/reorder/:siteCode` | Superadmin | Batch update sort order |
| PUT | `/rooms/:siteCode/:roomId` | Superadmin | Update name/capacity |
| DELETE | `/rooms/:siteCode/:roomId` | Superadmin | Soft-delete |

### Reservations (Public Alias)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reservations/:siteCode/:roomId` | None | List all events for a room |

### Events

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/events/:siteCode/:roomId` | Standard+ | Create one or more events (accepts array) |
| PUT | `/events/:siteCode/:roomId/:eventId` | Standard+ | Update a single event |
| DELETE | `/events/:siteCode/:roomId/:eventId` | Standard+ | Delete a single event |
| PUT | `/events/:siteCode/:roomId/group/:groupId` | Standard+ | Edit recurring series |
| DELETE | `/events/:siteCode/:roomId/group/:groupId` | Standard+ | Delete recurring series |
| POST | `/events/:siteCode/:roomId/:eventId/request-otp` | None | Send cross-device edit OTP |
| POST | `/events/:siteCode/:roomId/:eventId/verify-otp` | None | Verify cross-device edit OTP → editToken |
| POST | `/events/:siteCode/:roomId/:eventId/claim-request-otp` | None | Legacy claim OTP |
| POST | `/events/:siteCode/:roomId/:eventId/claim-verify-otp` | None | Legacy claim OTP verify |

### Config

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | None | Merged config (env + overrides) |
| PUT | `/config` | Superadmin | Update boolean flags |

### Weather

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/weather` | None | Current weather (open-meteo + OSM, cached 10 min) |

### Visitors

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/visitors/heartbeat` | None | Register/refresh session |
| GET | `/visitors` | None | Returns `{ live: N }` |

---

## Configuration System

Config is built by merging two sources (later wins):

```
.env values  (read via envReader.js — reads from disk on every call, hot-reload without restart)
    ↓ merged with
data/config_overrides.json   (written by PUT /api/config; created on first save)
    ↓
Final config object returned by GET /api/config
```

---

## Database Schema

Database name: `briya_room_reservations` (MySQL 8, connection timezone: `+00:00` UTC).

```sql
CREATE TABLE sites (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  site_code  VARCHAR(20)  NOT NULL UNIQUE,
  image_url  VARCHAR(255),
  sort_order INT DEFAULT 0,
  is_active  TINYINT(1) DEFAULT 1
);

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
CREATE TABLE IF NOT EXISTS trusted_devices ( ... );
CREATE TABLE IF NOT EXISTS login_otps ( ... );
CREATE TABLE IF NOT EXISTS users ( ... );

-- Auto-created by visitors.js on startup
CREATE TABLE IF NOT EXISTS visitor_sessions ( ... );
```

---

## File Attachments

- **Storage:** `uploads/` directory on the VPS (gitignored; upload manually via WinSCP/SCP)
- **Filenames:** `crypto.randomBytes(16).toString('hex') + ext` (prevents enumeration)
- **Serving:** Nginx serves `uploads/images/` directly at `/images/` with 7-day cache. Nginx `alias` points to `/home/briya/Briya-Backend-Room-Reservation/uploads/images/`

---

## Weather Proxy

- **Source:** Open-Meteo API (free, no key required); OpenStreetMap Nominatim for reverse geocoding
- **Caching:** Server-side in-memory cache, 10-minute TTL
- **Toggle:** Disabled by setting `weatherEnabled: false` in config

---

## Visitor Counter

- **Heartbeat:** `POST /visitors/heartbeat` upserts a row in `visitor_sessions`; also deletes stale rows (`last_seen < NOW() - INTERVAL 90 SECOND`)
- **Toggle:** Disabled by setting `visitorCounterEnabled: false` — returns `{ live: 0 }`

---

## Local Development

**Prerequisites:** Node.js 20+, MySQL 8+, npm.

```bash
git clone https://github.com/BRIYAPCS/briya-room-reservation-v2.git
cd briya-room-reservation-v2/backend
npm install
cp .env.example .env
# Fill in DB_*, JWT_SECRET, PIN_*, and optionally RESEND_API_KEY
npm run dev
# → http://localhost:4000
```

From the monorepo root (runs backend + frontend together):
```bash
npm run dev   # backend on :4000, frontend on :5173
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in every value.

| Variable | Description |
|---|---|
| `PORT` | Express listen port (`4000`) |
| `NODE_ENV` | `development` or `production` |
| `APP_TIMEZONE` | Display timezone (`America/New_York`) — DB connection uses UTC |
| `FRONTEND_URL` | CORS allowlist, comma-separated |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port (`3306`) |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password *(secret)* |
| `DB_NAME` | MySQL database name (`briya_room_reservations`) |
| `PIN_STANDARD` | Standard user PIN *(secret)* |
| `PIN_ADMIN` | Admin user PIN *(secret)* |
| `PIN_SUPER_ADMIN` | Superadmin PIN *(secret)* |
| `JWT_SECRET` | 96-char hex — generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EDIT_SECRET` | 128-char hex for short-lived edit tokens |
| `JWT_EDIT_EXPIRATION` | Edit token TTL (`15m`) |
| `RESEND_API_KEY` | From resend.com *(secret)* |
| `EMAIL_FROM` | Sender address |
| `OTP_EXPIRATION_MINUTES` | OTP code TTL (`10`) |
| `OTP_RESEND_COOLDOWN_SECONDS` | Min seconds between OTP requests (`300`) |
| `OTP_MAX_ATTEMPTS` | Max wrong guesses per OTP (`5`) |
| `TRUSTED_DEVICE_DAYS` | Device trust window in days (`90`) |
| `POWER_AUTOMATE_WEBHOOK_URL` | **Full URL including sig param** — copy from Postman/Power Automate |
| `BOOKING_START_HOUR` | Earliest bookable hour (`8`) |
| `BOOKING_END_HOUR` | Latest bookable hour (`21`) |
| `SLOT_DURATION_MINUTES` | Calendar slot size (`15`) |
| `ALLOW_WEEKENDS` | Show weekend columns (`true`) |
| `ALLOW_WEEKEND_BOOKINGS` | Allow Sat/Sun bookings (`false`) |
| `ALLOW_PAST_BOOKINGS` | Allow past-dated bookings (`false`) |
| `ALLOW_DOUBLE_BOOKING` | Allow overlapping bookings (`true`) |
| `REQUIRE_LOGIN_FOR_CALENDAR` | Gate calendar behind PIN (`true`) |
| `ENABLE_RECURRING_EVENTS` | Enable recurring booking UI (`true`) |
| `RECURRING_MAX_MONTHS` | Max months ahead for a series (`12`) |
| `BUSINESS_START` | Business hours start (`08:00`) |
| `BUSINESS_END` | Business hours end (`17:00`) |
| `BUSINESS_DAYS` | Active day indices, 0=Sun (`1,2,3,4,5`) |
| `CAN_CREATE_ROLES` | Roles allowed to create events |
| `EDIT_OTHERS_ROLE` | Min role to edit others' events (`admin`) |
| `DELETE_ROLE` | Min role to delete any event (`admin`) |
| `WEATHER_ENABLED` | Enable weather widget (`true`) |
| `WEATHER_CITY` | Fallback city name (`Washington, DC`) |
| `WEATHER_LAT` | Fallback latitude (`38.9072`) |
| `WEATHER_LON` | Fallback longitude (`-77.0369`) |
| `WEATHER_TEST_CONDITION` | Dev override — leave empty in prod |
| `VISITOR_COUNTER_ENABLED` | Enable visitor counter (`true`) |

---

## PM2 Process Manager

Configuration file: `ecosystem.config.cjs`
Process name: `Briya-Backend-Room-Reservation`

```
instances:          2        (cluster mode — 2 workers)
exec_mode:          cluster
max_memory_restart: 300M
max_restarts:       10
log path:           /var/log/Briya-Backend-Room-Reservation/
```

Common commands:

```bash
pm2 start ecosystem.config.cjs --env production          # First start
pm2 save                                                  # Persist across reboots
pm2 status                                                # Process list
pm2 logs Briya-Backend-Room-Reservation --lines 100       # Tail logs
pm2 reload Briya-Backend-Room-Reservation                 # Zero-downtime rolling restart
pm2 restart Briya-Backend-Room-Reservation                # Full restart (picks up .env changes)
pm2 flush Briya-Backend-Room-Reservation                  # Clear accumulated log files
pm2 monit                                                 # Live dashboard
```

---

## Nginx Configuration

Nginx handles HTTPS termination, HTTP→HTTPS redirect, reverse proxying to Node on port 4000, and direct static image serving.

```nginx
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

    client_max_body_size 22M;

    # Static images — served by nginx directly (faster; 7-day immutable cache)
    location /images/ {
        alias /home/briya/Briya-Backend-Room-Reservation/uploads/images/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
        access_log off;
    }

    # All other traffic → PM2/Node on port 4000
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

SSL auto-renewal via Certbot systemd timer:
```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

---

*Designed & Engineered by the Briya IT Team · © 2026 Briya Public Charter School*
