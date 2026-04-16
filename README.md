# Briya Room Reservation — Frontend

A React 18 / Vite single-page application for booking conference rooms and shared spaces at **Briya Public Charter School**. Deployed to GitHub Pages and connected to a Node.js/Express REST API backend hosted on Linode.

**Live URL:** `https://briyapcs.github.io/room-reservation/`  
**API base (production):** `https://briya-api.duckdns.org/api`  
**Health check:** `https://briya-api.duckdns.org/api/health`

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Pages](#pages)
- [Components](#components)
- [Authentication & Roles](#authentication--roles)
- [Email Verification & OTP Flow](#email-verification--otp-flow)
- [Session Management](#session-management)
- [Configuration System](#configuration-system)
- [API Service Layer](#api-service-layer)
- [Contexts](#contexts)
- [Responsiveness](#responsiveness)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Build & Deployment](#build--deployment)
- [GitHub Actions CI/CD](#github-actions-cicd)

---

## Features

### Booking
- **Multi-site, multi-room** navigation — Home → Site → Room → Calendar
- **FullCalendar** week view (time grid), month view, and list view
- **Drag-and-drop rescheduling** — drag events to move; resize to change duration
- **Recurring events** — Daily, Weekly (custom weekday picker), Bi-Weekly, Monthly with an "Ends On" date and a live occurrence counter preview
- **Series position badge** — every recurring event shows `🔁 N / Total` (computed live; updates when occurrences are deleted)
- **Event conflict detection** — overlapping bookings turn orange with a `⚠` badge
- **Search & filter** in list view (clearable text input)
- **Excel export** (admin/superadmin) from list view

### Authentication
- **PIN-based login** — no username or password, just a shared PIN per role
- **Three roles:** standard, admin, superadmin — each with distinct capabilities and a distinct avatar colour
- **Email OTP login** — optional for standard, **mandatory** for admin and superadmin
  - Verifies identity via a 6-digit code sent to a `@briya.org` email address
  - Server-side name lookup via Power Automate webhook
- **Trusted device fast-login** — once a device passes OTP, future logins on that device skip the code entirely and go straight to "Welcome back"
- **Welcome / goodbye screens** — animated confirmation after login ("Email verified · Welcome" or "Welcome back") and sign-out ("See you next time")
- **Forced-logout notification** — if "Sign out all devices" is pressed on another device, a banner appears within 30 seconds: "Signed out from all devices"
- **Session revocation polling** — email-verified sessions are probed every 30 seconds; a 401 triggers immediate logout + banner

### Admin
- **Superadmin dashboard** at `/admin` — feature toggles and booking rules via iOS-style switches, backed by server-side persistence
- **Site management** — create, rename, reorder, delete sites (superadmin)
- **Room management** — create, rename, reorder, delete rooms (superadmin)
- **Manage mode** — edit/delete controls appear directly on cards; separate from normal navigation
- **Drag-to-reorder** modal for sites and rooms

### UI
- **Fully responsive** — works on phones, tablets, laptops, and 4K displays
  - Mobile bottom sheets for action menus
  - Icon-only compact header on small screens
  - Auto-fit card grids that reflow from 1 to 4+ columns
- **Animated page transitions** — entrance animation on every route change (respects `prefers-reduced-motion`)
- **Weather widget** — live conditions chip with temperature, icon, and city name (server-side cached, geolocation-aware)
- **Visitor counter** — live badge showing how many users have the app open
- **File attachments** — upload/view/delete PDF, Office docs, and images per reservation
- **Rich text descriptions** — bold, italic, underline, bullet lists; smart URL linkification
- **Lazy-loaded pages** — each page is a separate JS chunk downloaded only when first visited

---

## Tech Stack

| Layer | Library / Tool |
|---|---|
| Framework | React 18.3 + Vite 5.4 |
| Routing | React Router v6 |
| Calendar | FullCalendar v6 (daygrid, timegrid, list, interaction plugins) |
| Styling | Plain CSS — CSS Grid, Flexbox, `clamp()`, `@media` queries (no CSS framework) |
| HTTP | Native `fetch()` via `src/services/api.js` wrapper |
| Auth | JWT in `localStorage`, 24-hour expiry |
| Build | Vite + esbuild (minification + manual chunk splitting) |
| Deploy | GitHub Pages via GitHub Actions |

---

## Project Structure

```
frontend/
├── public/
│   └── briya_logo.png              # Favicon + loading spinner
├── src/
│   ├── assets/
│   │   └── briya-logo-full.png     # Full horizontal logo for headers
│   ├── components/
│   │   ├── AddRoomModal.jsx/.css
│   │   ├── AddSiteModal.jsx/.css
│   │   ├── AttachmentSection.jsx/.css
│   │   ├── BookingModal.jsx/.css
│   │   ├── Breadcrumb.jsx/.css
│   │   ├── BriyaFullLogo.jsx
│   │   ├── BriyaLogo.jsx
│   │   ├── ClearableInput.jsx
│   │   ├── CrossDeviceVerifyModal.jsx/.css
│   │   ├── EditBookingModal.jsx/.css
│   │   ├── EditCardModal.jsx/.css
│   │   ├── ErrorBoundary.jsx
│   │   ├── EventDetailsModal.jsx/.css
│   │   ├── ForcedLogoutBanner.jsx/.css
│   │   ├── LegacyClaimModal.jsx
│   │   ├── LoginModal.jsx/.css
│   │   ├── ManageActionSheet.jsx/.css
│   │   ├── PageTransition.jsx/.css
│   │   ├── PINModal.jsx/.css
│   │   ├── RecurrenceActionSheet.jsx/.css
│   │   ├── RichTextEditor.jsx/.css
│   │   ├── SortModal.jsx/.css
│   │   ├── UserAvatar.jsx/.css
│   │   ├── VisitorCounter.jsx/.css
│   │   └── WeatherWidget.jsx/.css
│   ├── config/
│   │   └── appConfig.js            # Default config values used before API responds
│   ├── context/
│   │   ├── AuthContext.jsx         # Auth state, login/logout, OTP flow, session poll
│   │   └── ConfigContext.jsx       # App-wide config from GET /api/config
│   ├── pages/
│   │   ├── AdminPage.jsx/.css      # Superadmin feature-toggle dashboard
│   │   ├── CalendarPage.jsx/.css   # Core booking calendar
│   │   ├── HomePage.jsx/.css       # Site grid entry point
│   │   └── RoomsPage.jsx/.css      # Room grid for a selected site
│   ├── services/
│   │   └── api.js                  # All fetch() calls to the backend REST API
│   ├── utils/
│   │   ├── image.js                # Converts relative DB paths to full image URLs
│   │   ├── roles.js                # isAdmin(), isSuperAdmin() helpers
│   │   └── validateBriyaEmail.js   # Email validation stub
│   ├── App.jsx                     # BrowserRouter shell + lazy route definitions
│   ├── index.css                   # Global CSS reset and base typography
│   └── main.jsx                    # React DOM entry point
├── .env.example
├── .env.production                 # Committed — public build-time values only
├── index.html
├── package.json
└── vite.config.js                  # Base path, dev proxy, manual chunk splitting
```

---

## Pages

### HomePage (`/`)

Entry point. Fetches all sites from `GET /api/sites` and renders them as image cards in a responsive CSS Grid (auto-fit, `minmax(260px, 1fr)`).

- Clicking a card navigates to `/rooms/:siteId`
- Hovering a card prefetches its rooms for instant navigation
- **Superadmin manage mode:** a "Manage" button in the header reveals "+ Site" and "⇅ Sort" controls and overlays edit/delete buttons on each card
- Image loading is waited on before showing the page (6-second fallback timeout)
- All management actions gated by `siteManagementEnabled` config flag

### RoomsPage (`/rooms/:siteId`)

Fetches rooms from `GET /api/rooms/:siteCode` and renders them as image cards with capacity labels.

- Clicking a card navigates to `/calendar/:siteId/:roomId`
- Hovering prefetches that room's reservations
- Same manage mode pattern as HomePage (gated by `roomManagementEnabled`)
- Breadcrumb: "Home → [Site Name]"

### CalendarPage (`/calendar/:siteId/:roomId`)

Core reservation interface. Fetches events from `GET /api/reservations/:siteCode/:roomId`.

**Views:**
- **Week (default)** — FullCalendar `timeGridWeek`. Time slot height based on `slotDurationMinutes`. Drag-and-drop to reschedule; resize handle to change duration. `businessHours` highlight the configured business day window.
- **Month** — FullCalendar `dayGridMonth`. Pill-style events. Conflict badges.
- **List** — FullCalendar `listWeek` showing a scrollable table. Includes a ClearableInput search bar that filters event titles and a "Export to Excel" button (admin+).

**Modals opened from this page:**
- `LoginModal` — if `requireLoginForCalendar` is true and user is not logged in
- `BookingModal` — clicking an empty time slot or the "+ New Booking" button
- `EventDetailsModal` — clicking an existing event
- `EditBookingModal` — pressing Edit inside EventDetailsModal
- `CrossDeviceVerifyModal` — OTP flow for editing a booking from a different device (standard users only)
- `LegacyClaimModal` — claim a pre-migration booking that has no owner
- `RecurrenceActionSheet` — scope picker (this / this & following / all) when editing or deleting a recurring series

**Ownership logic (`getActionState`):**
- Superadmin / admin → always `allowed`
- Standard, `ownershipType === 'email'` → `allowed` if `auth.emailVerified && auth.email === event.ownerEmail`; otherwise `otp_required`
- Standard, `ownershipType === 'device'` → `allowed` if `auth.deviceSessionId === event.deviceSessionId`; otherwise `not_owner`
- Ended events (past end time) → `ended` (read-only for standard users)

### AdminPage (`/admin`)

Superadmin-only dashboard. Non-superadmins are redirected to `/` immediately.

- iOS-style toggle switches for 18 boolean config flags
- Calls `PUT /api/config` on each toggle; shows per-toggle saving/error indicator
- Changes take effect globally for all users immediately (no server restart required)
- Grouped into three sections: Management Controls, App Features, Booking Rules

---

## Components

### BookingModal
New event creation form.

- **All Day** toggle — hides time pickers
- **Recurring Event** toggle — reveals recurrence sub-section
- Recurrence types: Daily, Weekly, Bi-Weekly, Monthly
- Weekly mode shows a 7-button weekday picker (Mon–Sun)
- "Ends On" date picker with live occurrence counter ("Creates 8 occurrences")
- End Date field only shown for non-recurring events
- Validation: checks booking window hours, double-booking policy, past booking policy, weekend policy
- Submits an array of event objects to `POST /api/events/:siteCode/:roomId`

### EditBookingModal
Same structure as BookingModal but pre-filled with the existing event's data. Submits to `PUT /api/events/:siteCode/:roomId/:eventId`.

### EventDetailsModal
Read-only event detail popup.

- Displays title, date/time, description (rendered HTML), booked by, series badge
- Series badge `🔁 N / Total` is computed live from the loaded events in the parent — it reflects actual remaining occurrences
- **AttachmentSection** embedded at the bottom: list existing files with download links, upload new files, delete files
- Edit and Delete buttons appear based on `getActionState()` result
- For recurring events, Delete opens RecurrenceActionSheet

### LoginModal
Multi-step authentication modal.

**Steps:**
1. **pin** — PIN input + `@briya.org` email field
   - Email is optional for standard role
   - Email is **mandatory** for admin and superadmin (enforced after PIN validates)
   - Checks trusted device (`GET /api/auth/check-trusted`) before hitting rate-limited OTP endpoint
   - If trusted: fast-login, skip OTP → success screen "Welcome back"
   - If not trusted: send OTP (`POST /api/auth/request-login-otp`) → advance to OTP step
2. **otp** — 6-digit code entry
   - Live expiry countdown timer (10 minutes)
   - Resend button (5-minute cooldown)
   - "Skip email verification" link — **hidden for admin/superadmin**
   - On success: advances to name step (or auto-logins if PA returned a name)
3. **name** — display name entry (pre-filled from device memory if returning user)
4. **success** — animated confirmation screen (1.8s or 2.4s auto-close)
   - `verified` type: "Welcome, [Name]" + "Email verified · This device is now trusted"
   - `welcome_back` type: "Welcome back, [Name]" + "Trusted device — signed in automatically"
   - `goodbye` type: "See you next time, [Name]" + "You have been signed out"

**Status step** (shown when already logged in):
- Shows role badge, name, verified email (with lock icon if email-verified)
- "Switch Account" (hidden if email-verified — identity is locked)
- "Sign Out" → goodbye screen then logout
- "Sign out all devices" (shown only if email-verified) → goodbye screen then `POST /api/auth/logout-all`

### ForcedLogoutBanner
Fixed-position notification shown when another device triggered "Sign out all devices".

- Appears at bottom-center, above all other UI (z-index 9999)
- Slide-up animation with spring curve
- Shows: "Signed out from all devices" + "Hi [Name], your session was ended from another device."
- Auto-dismisses after 6 seconds; manual "OK" button
- Rendered inside `AuthProvider` so it is always available regardless of which page is open

### RichTextEditor
Contenteditable description field.

- Toolbar: Bold, Italic, Underline, Bullet List (uses `document.execCommand()`)
- Smart URL linkification — detects pasted or typed URLs and renders human-readable labels:

| Pasted URL pattern | Rendered label |
|---|---|
| `*.sharepoint.com/:b:/*` | SharePoint PDF (staff) |
| `docs.google.com/document/` | Google Doc |
| `docs.google.com/spreadsheets/` | Google Sheet |
| `youtube.com/watch` / `youtu.be/` | YouTube Video |
| `zoom.us/j/` | Zoom Meeting |
| `teams.microsoft.com/` | Microsoft Teams |
| Any other URL | Capitalised domain name |

### AttachmentSection
File management panel embedded inside EventDetailsModal.

- Lists existing attachments with original filename, size, MIME type, and a delete button
- Upload input (click or drag-and-drop) — accepts PDF, DOCX, XLSX, PPTX, JPG, PNG, GIF, WEBP (20 MB max)
- Shows upload progress state; surfaces backend error messages (file too large, type not allowed)
- Calls `GET /api/attachments/:reservationId`, `POST /api/attachments/:reservationId`, `DELETE /api/attachments/:id`

### WeatherWidget
Live weather chip shown in the page header.

- Requests `navigator.geolocation` on first render; falls back to server `.env` coordinates
- Calls `GET /api/weather?lat=&lon=` — data cached server-side for 10 minutes
- Displays: WMO condition icon (emoji), temperature (°F), condition text, city name
- Hidden when `weatherEnabled` config flag is false

### VisitorCounter
Small badge showing how many browser sessions currently have the app open.

- Generates a UUID session ID once per browser session (not persistent)
- Sends `POST /api/visitors/heartbeat` every 45 seconds to register as active
- Polls `GET /api/visitors` every 30 seconds to show the live count
- Sessions older than 90 seconds are considered stale and excluded from the count
- Hidden when `visitorCounterEnabled` is false

### UserAvatar
Role-coloured avatar icon in the top-right corner of every page.

- Standard → blue person icon
- Admin → gold crown icon
- Superadmin → purple shield icon
- Clicking it opens the LoginModal (status step if logged in, PIN step if not)

### CrossDeviceVerifyModal
OTP flow for editing a booking from a different device (standard users whose booking has `ownershipType === 'email'` but `auth.emailVerified` is false or email doesn't match).

- Prompts for the owner's email address
- Sends `POST /api/events/:siteId/:roomId/:eventId/request-otp`
- Verifies 6-digit code via `POST /api/events/.../verify-otp`
- On success, receives a short-lived `editToken` used in the subsequent PUT/DELETE request header

### RecurrenceActionSheet
Scope picker for editing or deleting a recurring series. Appears as a bottom sheet on mobile.

- **This event** — affects only the clicked occurrence
- **This & following events** — affects from this recurrence index to the end
- **All events** — affects every occurrence in the series

### SortModal
Drag-to-reorder UI for sites or rooms. Interactive list with drag handles (⠿). Submits the updated order array to `PUT /api/sites/reorder` or `PUT /api/rooms/reorder/:siteCode`.

### ClearableInput
Reusable text input component with an inline ✕ button that clears the value. Used in the list view search and the OTP step.

### PageTransition
Wraps each lazy-loaded page in a `<div>` with a CSS entrance animation (`opacity` + `translateY`). Reads `prefers-reduced-motion` and skips the animation if set.

### ErrorBoundary
React class component that catches rendering errors. Shows a fallback "Something went wrong" UI so the app never shows a blank screen on a component crash.

---

## Authentication & Roles

### Roles and Capabilities

| Role | Avatar colour | Create bookings | Edit/delete own bookings | Edit/delete any booking | Site/room management | Admin dashboard | Excel export |
|---|---|---|---|---|---|---|---|
| none (guest) | — | No (if login required) | — | — | — | — | — |
| standard | Blue | Yes | Yes (future only) | No | No | No | No |
| admin | Gold | Yes | Yes | Yes | No | No | Yes |
| superadmin | Purple | Yes | Yes | Yes | Yes | Yes | Yes |

### How Login Works

1. User enters PIN in LoginModal
2. `POST /api/auth/verify` returns `{ role, token, email, emailVerified, ... }`
3. JWT (24-hour expiry) is stored in `localStorage` under `authToken`
4. Auth state `{ role, name, email, emailVerified, deviceSessionId }` is stored in `localStorage` under `room_reservation_auth` and in React state
5. Device name (display name for this role) is stored in both `localStorage` and a 1-year cookie so it survives clearing localStorage

### Per-Role Name Memory

Each role (`standard`, `admin`, `superadmin`) has its own device name key in localStorage and a matching cookie:

| Role | localStorage key | Cookie name |
|---|---|---|
| standard | `briya_standard_name` | `briya_std_name` |
| admin | `briya_admin_name` | `briya_adm_name` |
| superadmin | `briya_superadmin_name` | `briya_sadm_name` |

When a trusted device logs in, the stored name is retrieved and the name step is skipped entirely.

---

## Email Verification & OTP Flow

### Why Email Verification Exists

Email verification links a booking to an identity (not just a device). Once verified:
- The user can edit their own bookings from **any device** — no re-OTP required
- The session can be revoked from another device via "Sign out all devices"
- The JWT contains `emailVerified: true` (set server-side — never self-asserted by the frontend)

### OTP Login Flow (New Device)

```
User enters PIN + @briya.org email
        ↓
POST /api/auth/check-trusted  (not rate-limited)
        ↓
  trusted = true?  →  fast login (skip OTP)
  trusted = false? ↓
POST /api/auth/request-login-otp
        ↓
  Server sends 6-digit code to email via Resend
        ↓
User enters code
        ↓
POST /api/auth/verify-login-otp  →  { ok, emailClaimToken }
        ↓
POST /api/auth/verify (with emailClaimToken)
        ↓
  Server verifies token, issues JWT with emailVerified=true
        ↓
Device added to trusted_devices (90-day TTL)
```

### Admin / Superadmin: Email Is Mandatory

For admin and superadmin roles:
- If the PIN validates but no `@briya.org` email was provided, the modal shows an error: "Admin access requires a verified @briya.org email." — the user cannot proceed without it
- "Skip email verification" is hidden in the OTP step
- "Continue without email" is hidden if OTP send fails — they must fix their email and retry
- Trusted device fast-login still works (the OTP was already completed once on that device)

### Trusted Device Logic

A device is trusted when:
- Its `email + deviceSessionId` pair exists in the `trusted_devices` table
- The stored user-agent matches (hard check)
- The IP may differ (soft check — warns in logs but does not reject)
- The trust has not expired (default 90-day TTL, configurable via `TRUSTED_DEVICE_DAYS`)

---

## Session Management

### Session Revocation Poll

For email-verified sessions, `AuthContext` polls `GET /api/auth/session` every 30 seconds via a direct `fetch()` (bypassing the `api.js` wrapper to handle the 401 differently).

When the response is 401:
1. The user's display name is captured from `authRef.current` (stale-closure-safe)
2. `authToken` and `room_reservation_auth` are removed from localStorage
3. React auth state is reset to "none"
4. `ForcedLogoutBanner` is shown with the user's name for 6 seconds

This means if User A presses "Sign out all devices" on their phone, User B's desktop session will receive the banner within ≤30 seconds.

### Token Expiry (401 from api.js)

When any API call returns 401 and a token was present, `api.js`:
1. Removes `authToken` and `room_reservation_auth` from localStorage
2. Dispatches the custom event `briya:auth:expired`
3. `AuthContext` catches this event and calls `logout()` silently (no banner — this is natural expiry, not a forced logout)

### logout vs logoutAll

- **`logout()`** — local only; clears localStorage and React state; no API call
- **`logoutAll()`** — calls `POST /api/auth/logout-all` first (which stamps `last_logout_at` in the DB and deletes all trusted devices for that email), then calls `logout()`

---

## Configuration System

On startup, `ConfigContext` fetches `GET /api/config` and provides the result to all pages via React context. The backend merges `.env` defaults with overrides in `config_overrides.json`.

### Toggleable Flags (via Admin Dashboard)

| Flag | Default | Description |
|---|---|---|
| `requireLoginForCalendar` | `true` | Gates the calendar behind a PIN prompt |
| `enableRecurringEvents` | `true` | Shows/hides the Recurring Event checkbox in BookingModal |
| `allowDoubleBooking` | `true` | Allows or blocks overlapping reservations |
| `allowPastBookings` | `false` | Allows or blocks past-dated bookings |
| `allowWeekendBookings` | `false` | Allows or blocks Saturday/Sunday slots |
| `weatherEnabled` | `true` | Shows/hides the WeatherWidget |
| `visitorCounterEnabled` | `true` | Shows/hides the VisitorCounter |
| `siteManagementEnabled` | `true` | Shows/hides superadmin site controls |
| `roomManagementEnabled` | `true` | Shows/hides superadmin room controls |

### Static Config (read-only from `.env`)

| Key | Description |
|---|---|
| `bookingStartHour` | Earliest bookable hour (e.g. `8` = 8am) |
| `bookingEndHour` | Latest bookable hour (e.g. `21` = 9pm) |
| `slotDurationMinutes` | Calendar time slot size (e.g. `15`) |
| `businessStart` / `businessEnd` | Business hours window (e.g. `08:00`/`17:00`) |
| `businessDays` | Active days (e.g. `1,2,3,4,5` = Mon–Fri) |
| `recurringMaxMonths` | Max months ahead a recurring series can extend |
| `canCreateRoles` | Which roles can create events |
| `editOthersRole` | Minimum role to edit someone else's booking |
| `deleteRole` | Minimum role to delete any booking |

---

## API Service Layer

`src/services/api.js` is a thin wrapper around `fetch()`.

**`request(path, options)`** — core function:
- Reads `authToken` from localStorage and injects `Authorization: Bearer <token>`
- On 401 with a token present: clears localStorage, dispatches `briya:auth:expired`
- On non-2xx: reads error body and throws with the server's `error` message

**All exported functions:**

| Function | Method | Endpoint |
|---|---|---|
| `verifyPin(pin, name, opts)` | POST | `/auth/verify` |
| `checkTrustedDevice(email, dsid)` | POST | `/auth/check-trusted` |
| `requestLoginOtp(email, dsid)` | POST | `/auth/request-login-otp` |
| `verifyLoginOtp(email, otp, dsid)` | POST | `/auth/verify-login-otp` |
| `checkSession()` | GET | `/auth/session` |
| `logoutAllSessions()` | POST | `/auth/logout-all` |
| `validateEmail(email)` | POST | `/auth/validate-email` |
| `getSites()` | GET | `/sites` |
| `getSite(id)` | GET | `/sites/:id` |
| `createSite(data)` | POST | `/sites` |
| `updateSite(id, data)` | PUT | `/sites/:id` |
| `deleteSite(id)` | DELETE | `/sites/:id` |
| `reorderSites(items)` | PUT | `/sites/reorder` |
| `getRooms(siteSlug)` | GET | `/rooms/:siteSlug` |
| `createRoom(siteCode, data)` | POST | `/rooms/:siteCode` |
| `updateRoom(siteCode, roomId, data)` | PUT | `/rooms/:siteCode/:roomId` |
| `deleteRoom(siteCode, roomId)` | DELETE | `/rooms/:siteCode/:roomId` |
| `reorderRooms(siteCode, items)` | PUT | `/rooms/reorder/:siteCode` |
| `getReservations(siteSlug, roomId)` | GET | `/reservations/:siteSlug/:roomId` |
| `addEvents(siteId, roomId, events)` | POST | `/events/:siteId/:roomId` |
| `updateEvent(siteId, roomId, event, editToken?)` | PUT | `/events/:siteId/:roomId/:eventId` |
| `deleteEvent(siteId, roomId, eventId, editToken?)` | DELETE | `/events/:siteId/:roomId/:eventId` |
| `updateRecurrenceGroup(...)` | PUT | `/events/:siteId/:roomId/group/:groupId` |
| `deleteRecurrenceGroup(...)` | DELETE | `/events/:siteId/:roomId/group/:groupId` |
| `requestEditOtp(...)` | POST | `/events/.../request-otp` |
| `verifyEditOtp(...)` | POST | `/events/.../verify-otp` |
| `claimRequestOtp(...)` | POST | `/events/.../claim-request-otp` |
| `claimVerifyOtp(...)` | POST | `/events/.../claim-verify-otp` |
| `getAttachments(reservationId)` | GET | `/attachments/:reservationId` |
| `uploadAttachment(reservationId, file)` | POST | `/attachments/:reservationId` |
| `deleteAttachment(id)` | DELETE | `/attachments/:id` |
| `getAttachmentUrl(id)` | — | Returns URL string for `/attachments/file/:id` |
| `getConfig()` | GET | `/config` |
| `updateConfig(data)` | PUT | `/config` |
| `getWeather(lat, lon)` | GET | `/weather` |
| `getVisitors()` | GET | `/visitors` |
| `heartbeatVisitor(sessionId)` | POST | `/visitors/heartbeat` |

---

## Contexts

### AuthContext (`src/context/AuthContext.jsx`)

Provides auth state and functions to the entire app.

**State:**
```js
auth = {
  role: 'none' | 'standard' | 'admin' | 'superadmin',
  name: string,
  email: string,
  emailVerified: boolean,
  deviceSessionId: string,   // UUID — persists in localStorage forever
}
```

**Exposed values:**
- `auth` — current auth state
- `login(pin, name, opts)` — calls `POST /api/auth/verify`, stores JWT + auth state
- `logout()` — clears localStorage, resets auth state (local only)
- `logoutAll()` — calls `POST /api/auth/logout-all`, then `logout()`
- `validatePin(pin)` — calls `POST /api/auth/verify` for PIN-only validation (returns role or null)
- `canDelete()` — returns true for admin and superadmin

**Side effects:**
- Listens for `briya:auth:expired` custom event → calls `logout()`
- Polls `GET /api/auth/session` every 30s when `emailVerified` is true → shows `ForcedLogoutBanner` on 401
- Renders `<ForcedLogoutBanner>` inside the Provider when `forcedLogoutName` is non-empty

**Helper exports:**
- `getDeviceName(role)` — reads the stored display name for a role (localStorage → cookie fallback)

### ConfigContext (`src/context/ConfigContext.jsx`)

Fetches `GET /api/config` on mount and provides the merged config object. Falls back to `appConfig.js` defaults until the API responds or if it fails.

**Exposed values:**
- `config` — current config object
- `updateConfig(key, value)` — calls `PUT /api/config` and updates local state

---

## Responsiveness

All pages and components are built with plain CSS. No breakpoint framework is used.

### Breakpoints

| Breakpoint | Target |
|---|---|
| `max-width: 480px` | Phones (portrait) |
| `max-width: 768px` | Phones (landscape) / small tablets |
| `min-width: 1400px` | Large desktop / 4K |

### Responsive Patterns Used

- **Card grids:** `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))` — reflows from 1 column on a phone to 4+ on wide screens
- **Modal sizing:** `width: calc(100vw - 32px)` with `max-width` so modals look good on both phones and desktops
- **Header:** Icons compress to icon-only on small screens; text labels are hidden via `display: none` at narrow widths
- **Bottom sheets:** `RecurrenceActionSheet` and `ManageActionSheet` use `position: fixed; bottom: 0` with a slide-up animation on mobile
- **Virtual keyboard avoidance:** `LoginModal` listens to `window.visualViewport` resize/scroll events and adds `paddingBottom` to push content above the soft keyboard
- **`clamp()` typography:** Font sizes use `clamp(minSize, viewportUnit, maxSize)` throughout modals and cards so text scales smoothly
- **`prefers-reduced-motion`:** All CSS transition/animation declarations are wrapped or overridden in a `@media (prefers-reduced-motion: reduce)` block that removes motion

---

## Local Development

**Prerequisites:** Node.js 18+, npm, backend running on `localhost:4000`.

```bash
# Clone the monorepo
git clone https://github.com/BRIYAPCS/room-reservation.git
cd "room-reservation/frontend"

# Install dependencies
npm install

# Create local .env
cp .env.example .env
# Set: VITE_API_BASE=http://localhost:4000/api

# Start the Vite dev server
npm run dev
# → http://localhost:5173
# /api and /images requests proxy automatically to localhost:4000
```

Or from the monorepo root (starts both backend and frontend together):
```bash
cd "Room Reservation"
npm install       # installs root concurrently dependency
npm run dev       # runs backend (port 4000) + frontend (port 5173) simultaneously
```

---

## Environment Variables

| Variable | Required | Description | Dev value | Prod value |
|---|---|---|---|---|
| `VITE_API_BASE` | Yes | Backend API base URL | `http://localhost:4000/api` | `https://briya-api.duckdns.org/api` |
| `VITE_BASE_PATH` | Prod only | GitHub Pages subpath | `/` | `/room-reservation/` |

`.env` is gitignored. `.env.production` is committed — it contains only public build-time values, no secrets.

---

## Build & Deployment

```bash
# Production build (outputs to dist/)
npm run build

# Preview the production build locally
npm run preview
```

### Bundle Chunks

Vite splits the bundle into named chunks for optimal caching:

| Chunk | Contents | When loaded |
|---|---|---|
| `vendor-react` | React, ReactDOM, React Router | Every page |
| `vendor-fullcalendar` | FullCalendar + all plugins | CalendarPage only |
| `HomePage` | Home page module | On first visit to `/` |
| `RoomsPage` | Rooms page module | On first visit to `/rooms/*` |
| `CalendarPage` | Calendar page module | On first visit to `/calendar/*` |
| `AdminPage` | Admin page module | On first visit to `/admin` |

---

## GitHub Actions CI/CD

Every `git push` to `main` triggers an automatic build and deployment to GitHub Pages.

**Workflow:** `.github/workflows/deploy.yml` (at repo root — not inside `frontend/`)

```
push to main
  → npm ci  (in frontend/)
  → npm run build  (uses VITE_API_BASE + VITE_BASE_PATH from GitHub Actions secrets)
  → upload dist/ as Pages artifact
  → deploy to https://briyapcs.github.io/room-reservation/
```

**Required GitHub Actions Secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VITE_API_BASE` | `https://briya-api.duckdns.org/api` |
| `VITE_BASE_PATH` | `/room-reservation/` |

**GitHub Pages source** must be set to "GitHub Actions" (not "Deploy from branch") in repo Settings → Pages.

Manual trigger: Actions → Deploy to GitHub Pages → Run workflow.

---

*Designed & Engineered by the Briya IT Team · © 2025 Briya Public Charter School*
