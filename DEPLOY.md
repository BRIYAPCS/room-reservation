# Briya Room Reservations — Full Deployment Playbook

## Overview

| Component | Where | URL |
|---|---|---|
| Frontend | GitHub Pages | `https://briyapcs.github.io/briya-room-reservation-v2/` |
| Backend API | Linode VPS (Ubuntu 22.04) | `https://briya-api.duckdns.org/api` |
| API health check | — | `https://briya-api.duckdns.org/api/health` |
| Temp domain | DuckDNS (free) | `briya-api.duckdns.org` → `<YOUR_SERVER_IP>` |
| Final domain | Squarespace (swap in later) | `https://www.briyaroomreservations.org` |
| GitHub repo | — | `github.com/BRIYAPCS/briya-room-reservation-v2` |
| Server folder | Linode `/home/briya/` | `Briya-Backend-Room-Reservation/` |
| PM2 process name | — | `Briya-Backend-Room-Reservation` |
| SSH private key | Local Windows machine | `<PATH_TO_SSH_KEY>` |
| SSH PuTTY key | Local Windows machine | `<PATH_TO_SSH_KEY_PPK>` |
| Linode server IP | — | `<YOUR_SERVER_IP>` |

---

## PART 1 — DuckDNS Free Subdomain

1. Go to **https://www.duckdns.org** → sign in with Google
2. Create subdomain: `briya-api` → gives you `briya-api.duckdns.org`
3. Enter Linode IP `<YOUR_SERVER_IP>` → click **Update IP**
4. DNS propagates in ~1 minute

---

## PART 2 — Linode Server Setup

### 2.1 Create Linode

- Plan: **Nanode 1GB** ($5/mo) — sufficient for this app
- Image: **Ubuntu 22.04 LTS**
- Region: closest to Washington DC (Newark or Atlanta)
- SSH Key: paste your public key (Linode → Settings → SSH Keys)
- Label: `briya-api-server`
- IP: `<YOUR_SERVER_IP>`

### 2.2 First login
```bash
ssh root@<YOUR_SERVER_IP>
```

### 2.3 Create a non-root user
```bash
adduser briya
usermod -aG sudo briya
rsync --archive --chown=briya:briya ~/.ssh /home/briya
```

### 2.4 Harden SSH (disable password login)
```bash
nano /etc/ssh/sshd_config
```
Set these values:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```
```bash
systemctl restart sshd
```

### 2.5 UFW Firewall
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP (nginx redirects to HTTPS)
ufw allow 443/tcp     # HTTPS (nginx)
# Port 4000 stays CLOSED externally — nginx proxies to it internally
ufw enable
ufw status
```

### 2.6 Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should say v20.x.x
npm -v
```

### 2.7 Install nginx
```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 2.8 Install Certbot (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2.9 Install PM2 (Node process manager)
```bash
sudo npm install -g pm2
pm2 startup systemd -u briya --hp /home/briya
# Run the command it outputs (starts with "sudo env PATH=...")
```

---

## PART 3 — Deploy the Backend

### 3.1 Upload backend code from local Windows machine
```powershell
# From PowerShell — use Windows paths, specify key
scp -r -i "<PATH_TO_SSH_KEY>" "C:\Users\Briya\Desktop\Room Reservation\backend" briya@<YOUR_SERVER_IP>:/home/briya/Briya-Backend-Room-Reservation
```

### 3.2 Install dependencies on server
```bash
cd /home/briya/Briya-Backend-Room-Reservation
npm install --omit=dev
```

### 3.3 Create the .env file ON THE SERVER (never committed to git)
```bash
nano /home/briya/Briya-Backend-Room-Reservation/.env
chmod 600 /home/briya/Briya-Backend-Room-Reservation/.env   # owner-only read
```

Full `.env` template:
```env
PORT=4000
NODE_ENV=production
APP_TIMEZONE=America/New_York

# Comma-separated allowed frontend origins
FRONTEND_URL=https://briyapcs.github.io,https://briyapcs.github.io/briya-room-reservation-v2,https://www.briyaroomreservations.org

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=briya
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=briya_room_reservations

# PINs — kept secret, never exposed to frontend
PIN_STANDARD=YOUR_STANDARD_PIN
PIN_ADMIN=YOUR_ADMIN_PIN
PIN_SUPER_ADMIN=YOUR_SUPERADMIN_PIN

# Generate fresh JWT secrets:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=YOUR_96_CHAR_HEX_SECRET
JWT_EDIT_SECRET=YOUR_SECOND_96_CHAR_HEX_SECRET

# Booking window
BOOKING_START_HOUR=8
BOOKING_END_HOUR=21
SLOT_DURATION_MINUTES=15

# Booking rules
ALLOW_WEEKENDS=true
ALLOW_WEEKEND_BOOKINGS=false
ALLOW_PAST_BOOKINGS=false
ALLOW_DOUBLE_BOOKING=true
REQUIRE_LOGIN_FOR_CALENDAR=true

# Recurring events
ENABLE_RECURRING_EVENTS=true
RECURRING_MAX_MONTHS=12

# Business hours (used for calendar highlight)
BUSINESS_START=08:00
BUSINESS_END=17:00
BUSINESS_DAYS=1,2,3,4,5

# Role-based permissions
CAN_CREATE_ROLES=superadmin,admin,standard
EDIT_OTHERS_ROLE=admin
DELETE_ROLE=admin

# Weather widget (Open-Meteo — free, no key required)
WEATHER_ENABLED=true
WEATHER_CITY=Washington, DC
WEATHER_LAT=38.9072
WEATHER_LON=-77.0369
WEATHER_TEST_CONDITION=

# Visitor counter
VISITOR_COUNTER_ENABLED=true

# Email OTP (Resend — get key from resend.com)
RESEND_API_KEY=re_YOUR_KEY
EMAIL_FROM=Briya Room Reservations <noreply@briya.org>
OTP_EXPIRATION_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=300
OTP_MAX_ATTEMPTS=5

# Trusted device TTL
TRUSTED_DEVICE_DAYS=90

# Power Automate webhook for @briya.org email directory lookup
# CRITICAL: paste the FULL URL from Power Automate including ALL query params:
#   ?api-version=...&sp=...&sv=...&sig=...
# Leaving this blank disables email directory validation (login still works).
POWER_AUTOMATE_WEBHOOK_URL=
```

### 3.4 Create uploads directory structure
```bash
mkdir -p /home/briya/Briya-Backend-Room-Reservation/uploads/images/Sites
mkdir -p /home/briya/Briya-Backend-Room-Reservation/uploads/images/Rooms/Fort_Totten
mkdir -p /home/briya/Briya-Backend-Room-Reservation/uploads/images/Rooms/Georgia
mkdir -p /home/briya/Briya-Backend-Room-Reservation/uploads/images/Rooms/Georgia_Annex
mkdir -p /home/briya/Briya-Backend-Room-Reservation/uploads/images/Rooms/Ontario
mkdir -p /home/briya/Briya-Backend-Room-Reservation/uploads/images/Rooms/Shepherd
```

### 3.5 Set correct permissions on uploads (CRITICAL)
nginx runs as `www-data` and needs read access through the entire path.
```bash
chmod 755 /home/briya                                                         # must be traversable
chmod 755 /home/briya/Briya-Backend-Room-Reservation                         # must be traversable
chmod 755 /home/briya/Briya-Backend-Room-Reservation/uploads                 # defaults to 700 — fix this!
chmod -R 755 /home/briya/Briya-Backend-Room-Reservation/uploads/images
find /home/briya/Briya-Backend-Room-Reservation/uploads/images -name "*.webp" -exec chmod 644 {} \;
```

> **If you get 403 Forbidden on images:** check each directory in the chain with `ls -ld`.
> The `uploads/` directory defaulting to `700` is the most common cause.

### 3.6 Upload site and room images via SCP
Images are NOT in git (`uploads/` is gitignored). Upload manually each time:
```powershell
# Site images
scp -r -i "<PATH_TO_SSH_KEY>" "C:\Users\Briya\Desktop\Room Reservation\backend\uploads\images\Sites" briya@<YOUR_SERVER_IP>:/home/briya/Briya-Backend-Room-Reservation/uploads/images/

# Room images (all folders at once)
scp -r -i "<PATH_TO_SSH_KEY>" "C:\Users\Briya\Desktop\Room Reservation\backend\uploads\images\Rooms" briya@<YOUR_SERVER_IP>:/home/briya/Briya-Backend-Room-Reservation/uploads/images/
```
After uploading, re-run the chmod commands from 3.5 to fix permissions on new files.

### 3.7 Image format — use WebP
All images should be **WebP** at quality 75 (use squoosh.app before uploading). WebP is 70–80% smaller than JPEG/PNG with no visible quality loss.

DB `image_url` paths format:
- Sites: `/images/Sites/fort_totten.webp`
- Rooms: `/images/Rooms/Fort_Totten/ft_academic_nest.webp`

To bulk-update DB after converting images:
```sql
SET SQL_SAFE_UPDATES = 0;
UPDATE rooms SET image_url = REPLACE(image_url, '.jpeg', '.webp') WHERE image_url LIKE '%.jpeg';
UPDATE rooms SET image_url = REPLACE(image_url, '.jpg',  '.webp') WHERE image_url LIKE '%.jpg';
UPDATE rooms SET image_url = REPLACE(image_url, '.png',  '.webp') WHERE image_url LIKE '%.png';
SET SQL_SAFE_UPDATES = 1;
```

### 3.8 Create log directory and start with PM2
```bash
# Create the log directory PM2 expects
sudo mkdir -p /var/log/Briya-Backend-Room-Reservation
sudo chown briya:briya /var/log/Briya-Backend-Room-Reservation

# Start using the ecosystem config (cluster mode, 2 workers)
cd /home/briya/Briya-Backend-Room-Reservation
pm2 start ecosystem.config.cjs --env production
pm2 save          # persist across reboots
pm2 logs Briya-Backend-Room-Reservation --lines 50   # verify clean startup
```

Expected startup log output (×2 for each cluster worker):
```
Server running on port 4000
DB connected ✓
Trusted devices table ready
Login OTPs table ready
Users table ready
Visitor sessions table ready
```

---

## PART 4 — MySQL Database Setup

### 4.1 Install MySQL 8
```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
sudo mysql_secure_installation   # set root password, remove anonymous users
```

### 4.2 Create database and user
```bash
sudo mysql -u root -p
```
```sql
CREATE DATABASE briya_room_reservations CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'briya'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON briya_room_reservations.* TO 'briya'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4.3 Core tables

The following tables are **auto-created on server startup** (no manual SQL needed):
- `trusted_devices` — email + device session trust registry
- `login_otps` — OTP codes with HMAC hashes and expiry
- `users` — session revocation tracker
- `visitor_sessions` — active browser session tracking

The following tables must be **created manually** (or restored from a dump):

```sql
USE briya_room_reservations;

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
  site_id    INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  room_code  VARCHAR(20)  NOT NULL,
  capacity   INT DEFAULT 0,
  image_url  VARCHAR(255),
  sort_order INT DEFAULT 0,
  is_active  TINYINT(1) DEFAULT 1,
  UNIQUE KEY uq_room_code_site (room_code, site_id),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE reservations (
  id                          INT AUTO_INCREMENT PRIMARY KEY,
  site_id                     INT NOT NULL,
  room_id                     INT NOT NULL,
  title                       VARCHAR(255) NOT NULL,
  description                 TEXT,
  start_time                  DATETIME NOT NULL,
  end_time                    DATETIME NOT NULL,
  all_day                     TINYINT(1) DEFAULT 0,
  created_by_name             VARCHAR(100),
  created_tz                  VARCHAR(60),
  owner_email                 VARCHAR(255),
  ownership_type              VARCHAR(10) DEFAULT 'device',
  created_device_session_id   VARCHAR(128),
  recurrence_group_id         VARCHAR(64),
  recurrence_index            INT DEFAULT 0,
  last_verified_edit_at       DATETIME,
  last_verified_edit_email    VARCHAR(255),
  created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
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
```

### 4.4 Restore from a dump
```bash
# Export from current server (or local dev)
mysqldump -u briya -p briya_room_reservations > briya_dump_$(date +%Y%m%d).sql

# Import to fresh server
mysql -u briya -p briya_room_reservations < briya_dump_2026XXXX.sql
```

---

## PART 5 — Nginx Configuration

### 5.1 Get SSL certificate FIRST
```bash
sudo certbot certonly --nginx -d briya-api.duckdns.org
# Certificate saved to: /etc/letsencrypt/live/briya-api.duckdns.org/
```

### 5.2 Create nginx site config
```bash
sudo nano /etc/nginx/sites-available/briya-api
```

Paste this complete configuration:
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

    # SSL — Let's Encrypt
    ssl_certificate     /etc/letsencrypt/live/briya-api.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/briya-api.duckdns.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer-when-downgrade always;

    # Logs
    access_log /var/log/nginx/briya-api-access.log;
    error_log  /var/log/nginx/briya-api-error.log;

    # Max upload size for room/site image uploads
    client_max_body_size 5M;

    # Static images served directly by nginx (bypasses Node; 7-day immutable cache)
    # Files live at: /home/briya/Briya-Backend-Room-Reservation/uploads/images/
    # URL pattern:   GET /images/Sites/fort_totten.webp
    location /images/ {
        alias /home/briya/Briya-Backend-Room-Reservation/uploads/images/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";   # required for cross-origin image loads
        access_log off;
    }

    # All API traffic proxied to Node/PM2 on port 4000
    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

### 5.3 Enable the site and reload nginx
```bash
sudo ln -s /etc/nginx/sites-available/briya-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default      # remove default placeholder
sudo nginx -t                                     # MUST say "syntax is ok"
sudo systemctl reload nginx
```

### 5.4 Auto-renew SSL
Certbot installs a systemd timer automatically. Verify it is active:
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run   # test renewal without actually renewing
```

---

## PART 6 — GitHub Repository Structure

The **single monorepo** at `github.com/BRIYAPCS/briya-room-reservation-v2` contains:
```
briya-room-reservation-v2/
├── .github/
│   └── workflows/
│       └── deploy.yml        ← MUST be at repo root (not inside frontend/)
├── backend/                  ← Express/Node API (manually deployed via SCP)
├── frontend/                 ← React/Vite app (auto-deployed via GitHub Actions)
├── DEPLOY.md
└── package.json              ← Root monorepo scripts (concurrently for dev)
```

> The backend is **not** auto-deployed. Update it on Linode manually (see Part 9).

---

## PART 7 — GitHub Actions & GitHub Pages

### 7.1 Workflow file location
The workflow MUST be at **`/.github/workflows/deploy.yml`** (repo root), NOT inside `frontend/`. This is because the repo root contains both `backend/` and `frontend/`.

The workflow uses `working-directory: frontend` for all npm commands.

### 7.2 Add GitHub Actions Secrets
Go to: **repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `VITE_API_BASE` | `https://briya-api.duckdns.org/api` |
| `VITE_BASE_PATH` | `/briya-room-reservation-v2/` |

### 7.3 Enable GitHub Pages
- Go to: **repo → Settings → Pages**
- Source: **GitHub Actions** (NOT "Deploy from a branch")

### 7.4 How deployments work
Every `git push` to `main` automatically triggers the workflow:
1. Checkout code
2. `npm ci` in `frontend/`
3. `npm run build` with secrets as env vars → `frontend/dist/`
4. Upload `dist/` as the Pages artifact
5. Deploy to `https://briyapcs.github.io/briya-room-reservation-v2/`

Manual trigger: **Actions → Deploy to GitHub Pages → Run workflow**

### 7.5 Pushing frontend changes
```powershell
cd "C:\Users\Briya\Desktop\Room Reservation"
git add frontend/src/...
git commit -m "your message"
git push
# GitHub Actions auto-deploys in ~1 minute
```

---

## PART 8 — Switching to Final Domain (Later)

When `briyaroomreservations.org` is active from Squarespace:

**DNS (add in Squarespace DNS settings):**
- A record: `api` → `<YOUR_SERVER_IP>`

**Get new SSL cert:**
```bash
sudo certbot certonly --nginx -d api.briyaroomreservations.org
# Update /etc/nginx/sites-available/briya-api:
#   server_name api.briyaroomreservations.org;
#   ssl_certificate paths updated
sudo systemctl reload nginx
```

**Backend `.env` on Linode:**
```env
FRONTEND_URL=https://www.briyaroomreservations.org,https://briyapcs.github.io
```

**Frontend `.env.production`:**
```env
VITE_API_BASE=https://api.briyaroomreservations.org/api
VITE_BASE_PATH=/
```

**GitHub Actions Secrets — update both:**
- `VITE_API_BASE` → `https://api.briyaroomreservations.org/api`
- `VITE_BASE_PATH` → `/`

Then push any change to trigger a redeploy.

---

## PART 9 — Day-to-Day Operations

### SSH into the server
```powershell
ssh -i "<PATH_TO_SSH_KEY>" briya@<YOUR_SERVER_IP>
```

### Check backend status
```bash
pm2 status
pm2 logs Briya-Backend-Room-Reservation --lines 100
```

### Restart backend after .env change
```bash
pm2 restart Briya-Backend-Room-Reservation
```

### Zero-downtime reload after code change
```bash
pm2 reload Briya-Backend-Room-Reservation
```

### View live PM2 dashboard
```bash
pm2 monit
```

### Update backend code on server
```powershell
# Option A: SCP updated source files
scp -i "<PATH_TO_SSH_KEY>" -r "C:\Users\Briya\Desktop\Room Reservation\backend\src" briya@<YOUR_SERVER_IP>:/home/briya/Briya-Backend-Room-Reservation/
# Then on server:
pm2 reload Briya-Backend-Room-Reservation
```

### Check nginx logs
```bash
sudo tail -100 /var/log/nginx/briya-api-error.log
sudo tail -100 /var/log/nginx/briya-api-access.log
```

### Check PM2 app logs
```bash
sudo tail -100 /var/log/Briya-Backend-Room-Reservation/error.log
sudo tail -100 /var/log/Briya-Backend-Room-Reservation/out.log
```

### Check server resources
```bash
htop         # CPU + memory per process
df -h        # disk usage
free -h      # available memory
```

### Add new room or site images
1. Convert to WebP at quality 75 (squoosh.app)
2. SCP to the correct subdirectory on Linode
3. Fix permissions: `chmod 644 /home/briya/Briya-Backend-Room-Reservation/uploads/images/Rooms/SiteName/*.webp`
4. Update `image_url` column in the `rooms` or `sites` table
5. Nginx serves images immediately — no restart needed

### Back up the database
```bash
# On the server
mysqldump -u briya -p briya_room_reservations > ~/backups/briya_$(date +%Y%m%d_%H%M).sql
```

---

## PART 10 — Troubleshooting

### Images return 403 Forbidden
The full directory chain from `/home/briya` to the image file must all be traversable (`755`). The `uploads/` directory defaults to `700` on creation — this is the most common cause.

```bash
# Check each directory in the chain
ls -ld /home/briya
ls -ld /home/briya/Briya-Backend-Room-Reservation
ls -ld /home/briya/Briya-Backend-Room-Reservation/uploads        # ← most likely culprit (700 by default)
ls -ld /home/briya/Briya-Backend-Room-Reservation/uploads/images
ls -ld /home/briya/Briya-Backend-Room-Reservation/uploads/images/Sites

# Fix
chmod 755 /home/briya/Briya-Backend-Room-Reservation/uploads
chmod -R 755 /home/briya/Briya-Backend-Room-Reservation/uploads/images
find /home/briya/Briya-Backend-Room-Reservation/uploads -name "*.webp" -exec chmod 644 {} \;
sudo systemctl reload nginx

# Test
curl -I https://briya-api.duckdns.org/images/Sites/fort_totten.webp
# Should return: HTTP/2 200, content-type: image/webp
```

### GitHub Actions workflow not detected
The workflow file MUST be at the **repo root**: `.github/workflows/deploy.yml`  
Not inside `frontend/.github/workflows/deploy.yml`.

### SCP "Permission denied (publickey)"
Always specify the key explicitly:
```powershell
scp -i "<PATH_TO_SSH_KEY>" -r <source> briya@<YOUR_SERVER_IP>:<dest>
```

### SCP interactive prompt won't accept typing
Add `-o StrictHostKeyChecking=accept-new`:
```powershell
scp -i "<PATH_TO_SSH_KEY>" -o StrictHostKeyChecking=accept-new -r <source> briya@<YOUR_SERVER_IP>:<dest>
```

### Backend not responding
```bash
pm2 status                                                       # check if process is online
pm2 logs Briya-Backend-Room-Reservation --lines 50              # check for startup errors
sudo nginx -t                                                    # verify nginx config is valid
curl http://127.0.0.1:4000/api/health                           # test Node directly, bypassing nginx
```

### OTP emails not being received
```bash
# Check server logs for Resend errors
pm2 logs Briya-Backend-Room-Reservation --lines 50 | grep resend
pm2 logs Briya-Backend-Room-Reservation --lines 50 | grep OTP

# Verify RESEND_API_KEY is set
grep RESEND_API_KEY /home/briya/Briya-Backend-Room-Reservation/.env
```

### "Email not found in Briya directory" error
Power Automate webhook URL is missing authentication parameters.

```bash
# Check current value
grep POWER_AUTOMATE_WEBHOOK_URL /home/briya/Briya-Backend-Room-Reservation/.env
```

The URL must include **all** query parameters from Power Automate:
```
https://prod-XX.westus.logic.azure.com/workflows/.../triggers/manual/paths/invoke?api-version=XXXX&sp=XXX&sv=XXX&sig=XXXXXXXXXXX
```
Copy the full URL from Power Automate → HTTP trigger → "Copy URL", then update `.env` and `pm2 restart Briya-Backend-Room-Reservation`.

### Trusted device not bypassing OTP
Check backend debug logs — the `check-trusted` endpoint logs the full decision:
```
[auth] check-trusted | email=... | dsid_len=36 | trusted=false | reason=UA_MISMATCH
```

Common causes:
- Different browser or browser update (UA changed)
- `device_session_id` changed (localStorage was cleared)
- Trusted device row expired (`expires_at` past)

### Session revocation not propagating to other devices
The frontend polls `GET /auth/session` every 30 seconds — forced logout propagates within 30 seconds maximum. If it's not happening:
1. Verify the other device has an email-verified session (`auth.emailVerified === true`)
2. Guest or PIN-only sessions are not polled (they can't be revoked by logout-all)

### EADDRINUSE — port 4000 already in use
An old PM2 process is holding the port.
```bash
pm2 list                          # find stale process names
pm2 stop <old-process-name>
pm2 delete <old-process-name>
pm2 start ecosystem.config.cjs --env production
```

---

## Pre-Launch Checklist

### Infrastructure
- [x] DuckDNS `briya-api.duckdns.org` → Linode IP `<YOUR_SERVER_IP>`
- [x] UFW firewall: ports 22, 80, 443 only (4000 closed externally)
- [x] SSH password auth disabled; key-only
- [x] MySQL database created; `briya` user with correct grants
- [x] Core tables created (sites, rooms, reservations, audit_logs)

### Backend
- [x] `.env` on server: `NODE_ENV=production`
- [x] `.env` on server: fresh `JWT_SECRET` and `JWT_EDIT_SECRET` (not dev placeholders)
- [x] `.env` on server: `FRONTEND_URL` includes GitHub Pages URL
- [x] `.env` on server: `RESEND_API_KEY` set (OTP emails working)
- [x] `.env` on server: `POWER_AUTOMATE_WEBHOOK_URL` is the **full URL** with `sp`, `sv`, `sig` params
- [x] `.env` permissions: `chmod 600 .env`
- [x] PM2 running cluster mode (2 workers): `pm2 status` shows 2× `Briya-Backend-Room-Reservation` online
- [x] PM2 saved and startup enabled: `pm2 save` + `pm2 startup`
- [x] Log directory created: `/var/log/Briya-Backend-Room-Reservation/`
- [x] `uploads/` directory permissions set to `755` (not `700`)

### Nginx
- [x] nginx config tested: `sudo nginx -t` → "syntax is ok"
- [x] SSL cert issued for `briya-api.duckdns.org`
- [x] Auto-renew active: `sudo systemctl status certbot.timer`
- [x] `/images/` alias points to `Briya-Backend-Room-Reservation/uploads/images/`
- [x] `/images/` location has `Access-Control-Allow-Origin "*"` header
- [x] `client_max_body_size 5M` set

### Images
- [x] Site images converted to WebP (quality 75) and uploaded to `/uploads/images/Sites/`
- [x] Room images converted to WebP and uploaded to correct `/uploads/images/Rooms/<Site>/` folders
- [x] DB `image_url` columns updated to `.webp` extensions
- [x] Image permissions fixed after upload

### Frontend / CI-CD
- [x] GitHub Actions secrets: `VITE_API_BASE`, `VITE_BASE_PATH=/briya-room-reservation-v2/`
- [x] GitHub Pages source set to "GitHub Actions"
- [x] Workflow file at repo root `.github/workflows/deploy.yml`
- [x] Successful Actions deployment: green checkmark

### End-to-End Tests
- [x] `https://briya-api.duckdns.org/api/health` → `{"status":"OK"}`
- [x] `https://briyapcs.github.io/briya-room-reservation-v2/` → app loads, site images visible
- [x] PIN login (standard) → welcome screen → calendar visible
- [x] OTP login (admin) → email received → code accepted → "Email verified" screen
- [x] Trusted device login → "Welcome back" (no OTP)
- [x] Room booking creates reservation and appears on calendar
- [x] Recurring booking creates multiple occurrences
- [x] Drag-to-reschedule works on week view
- [x] "Sign out all devices" → other tab receives forced logout banner within 30s
- [ ] Shepherd rooms — assign SH_1–SH_10 images to correct room names in DB

---

*Designed & Engineered by the Briya IT Team · © 2026 Briya Public Charter School*
