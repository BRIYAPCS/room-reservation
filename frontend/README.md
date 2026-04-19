# Briya Room Reservations — Frontend

A React 18 / Vite single-page application for booking conference rooms and shared spaces at **Briya Public Charter School**. Deployed to GitHub Pages and connected to a Node.js/Express REST API backend hosted on Linode.

**Live URL:** `https://briyapcs.github.io/briya-room-reservation-v2/`  
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
- [Performance](#performance)
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
- **Multi-day events** — a single booking that spans multiple calendar days
- **Event conflict detection** — overlapping bookings turn orange with a `⚠` badge
- **Live "Meeting in progress" indicator** — green pulsing dot on in-progress events; "Meeting in progress" row in the event details modal
- **Search & filter** in list view (clearable text input)
- **Excel export** (admin/superadmin) from list view

### Authentication
- **PIN-based login** — three role PINs (standard, admin, superadmin) configured server-side in `.env`
- **Three roles:** standard, admin, superadmin — each with distinct capabilities and a distinct avatar colour
- **Email OTP login** — optional for standard, **mandatory** for admin and superadmin
  - Power Automate webhook validates `@briya.org` email and returns the user's display name
  - Verified via a 6-digit code sent to the email address
  - PA name pre-fills the name step and skips it entirely once verified
- **Trusted device fast-login** — once a device passes OTP, future logins skip the code entirely → "Welcome back"
- **OTP session persistence** — `sessionStorage` saves the OTP step state before the user switches to their email app; restored on page reload so mobile users never lose their place
- **Welcome / goodbye screens** — animated confirmation after login and sign-out
- **Forced-logout notification** — if "Sign out all devices" is pressed on another device, a banner appears within 30 seconds
- **Session revocation polling** — email-verified sessions are probed every 30 seconds; a 401 triggers immediate logout + banner

### Admin
- **Superadmin dashboard** at `/admin` — feature toggles and booking rules via iOS-style switches
- **Site management** — create, rename, reorder, delete sites (superadmin)
- **Room management** — create, rename, reorder, delete rooms (superadmin)
- **Manage mode** — edit/delete controls appear directly on cards
- **Drag-to-reorder** modal for sites and rooms

### UI
- **Fully responsive** — works on phones, tablets, laptops, and 4K displays
  - Mobile bottom sheets for action menus and modals
  - Icon-only compact header on small screens
  - Auto-fit card grids that reflow from 1 to 4+ columns
- **Animated page transitions** (respects `prefers-reduced-motion`)
- **Past event protection** — standard users see a read-only view (X to close, no edit/delete buttons); admins retain full access
- **Weather widget** — live conditions chip with temperature, icon, and city name
- **Visitor counter** — live badge showing how many users have the app open
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
│   │   ├── BookingModal.jsx/.css
│   │   ├── Breadcrumb.jsx/.css
│   │   ├── BriyaFullLogo.jsx
│   │   ├── BriyaLogo.jsx
│   │   ├── ClearableInput.jsx/.css
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

Entry point. Fetches all sites from `GET /api/sites` and renders them as image cards in a responsive CSS Grid (`auto-fit, minmax(260px, 1fr)`).

- Clicking a card navigates to `/rooms/:siteId`
- Hovering a card prefetches its rooms for instant navigation
- First card image loads eagerly; subsequent cards use `loading="lazy"`
- **Superadmin manage mode:** a "Manage" button reveals "+ Site" and "⇅ Sort" controls and overlays edit/delete buttons on each card
- All management actions gated by `siteManagementEnabled` config flag

### RoomsPage (`/rooms/:siteId`)

Fetches rooms from `GET /api/rooms/:siteCode` and renders them as image cards with capacity labels.

- Clicking a card navigates to `/calendar/:siteId/:roomId`
- Hovering prefetches that room's reservations
- First card image eager, rest lazy
- Same manage mode pattern as HomePage (gated by `roomManagementEnabled`)
- Breadcrumb: "Home → [Site Name]"

### CalendarPage (`/calendar/:siteId/:roomId`)

Core reservation interface. Fetches events from `GET /api/reservations/:siteCode/:roomId`.

**Views:**
- **Week (default)** — FullCalendar `timeGridWeek`. Drag-and-drop to reschedule; resize to change duration. `businessHours` highlight the configured window. Green pulsing dot on events currently in progress.
- **Month** — FullCalendar `dayGridMonth`. Pill-style events with conflict badges and green live-dot.
- **List** — FullCalendar `listWeek`. Clearable search bar; "Export to Excel" button (admin+).

**Modals opened from this page:**
- `LoginModal` — if `requireLoginForCalendar` is true and user is not logged in
- `BookingModal` — clicking an empty time slot or the "+ New Booking" button
- `EventDetailsModal` — clicking an existing event
- `EditBookingModal` — pressing Edit inside EventDetailsModal
- `CrossDeviceVerifyModal` — OTP flow for editing a booking from a different device
- `LegacyClaimModal` — claim a pre-migration booking with no owner
- `RecurrenceActionSheet` — scope picker when editing or deleting a recurring series

**Ownership logic (`getActionState`):**
- Superadmin / admin → always `allowed`
- Standard, `ownershipType === 'email'` → `allowed` if `auth.emailVerified && auth.email === event.ownerEmail`; otherwise `otp_required`
- Standard, `ownershipType === 'device'` → `allowed` if `auth.deviceSessionId === event.deviceSessionId`; otherwise `not_owner`
- Past events (end time ≤ now) → read-only for standard users; edit/delete buttons hidden

### AdminPage (`/admin`)

Superadmin-only dashboard. Non-superadmins are redirected to `/` immediately.

- iOS-style toggle switches for boolean config flags
- Calls `PUT /api/config` on each toggle; shows per-toggle saving/error indicator
- Changes take effect globally for all users immediately (no server restart required)
- Grouped: Management Controls, App Features, Booking Rules

---

## Components

### BookingModal
New event creation form.

- **All Day** toggle — hides time pickers
- **Recurring Event** toggle — reveals recurrence sub-section; types: Daily, Weekly, Bi-Weekly, Monthly
- Weekly mode shows a 7-button weekday picker (Mon–Sun)
- **Multi-day** mode — End Date field shown for non-recurring events; creates one event spanning both dates
- "Ends On" date picker with live occurrence counter ("Creates 8 occurrences")
- Time pickers filter to valid slots only: past times removed for today; times after existing end removed from start; slot boundary aligned to `slotDurationMinutes`
- Validates booking window hours, double-booking policy, past booking policy, weekend policy
- Submits an array of event objects to `POST /api/events/:siteCode/:roomId`

### EditBookingModal
Same structure as BookingModal but pre-filled with existing event data. Submits to `PUT /api/events/:siteCode/:roomId/:eventId`.

### EventDetailsModal
Event detail popup.

- Header: title on the left; series badge (`🔁 N / Total`) and X close button on the right
- Body: title, booked by, email (admin-only lock icon row), time, description (rendered HTML), last-edited-by row
- **"Meeting in progress" banner** — green pulsing dot + text shown when the event is currently active
- **Past event behaviour (standard users):** footer (Edit/Delete/Close buttons) is hidden entirely; only the X button in the header remains — preserves booking history integrity
- **Admin behaviour:** Edit and Delete always visible regardless of past/present status
- Edit and Delete visibility otherwise based on `getActionState()` result
- For recurring events, Delete opens `RecurrenceActionSheet`
- Confirm dialog before deleting a single non-recurring event

### LoginModal
Multi-step authentication modal.

**Steps:**
1. **pin** — PIN input + `@briya.org` email field
   - Email optional for standard; **mandatory** for admin and superadmin
   - Power Automate validates the email against the Briya directory before hitting the OTP endpoint
   - If email not found in directory: warning banner + "Try again →" / "Skip →" (standard only)
   - Checks trusted device before hitting the rate-limited OTP endpoint
   - Trusted + PA name available → fast-login, skip name step → success screen "Welcome back"
   - Not trusted → send OTP → advance to OTP step
   - OTP session saved to `sessionStorage` so mobile users don't lose their place when switching to email app
2. **otp** — 6-digit code entry
   - Live expiry countdown (10 minutes); resend button (5-minute cooldown)
   - "Skip email verification" hidden for admin/superadmin
   - On success: auto-logins with PA name if available; otherwise advances to name step
3. **name** — display name entry (pre-filled from device memory if returning user)
4. **success** — animated confirmation screen (1.8 s or 2.4 s auto-close)
   - `welcome_back`: "Welcome back, [Name]" + "Trusted device — signed in automatically"
   - `verified`: "Welcome, [Name]" + "Email verified · This device is now trusted"
   - `goodbye`: "See you next time, [Name]" + "You have been signed out"

**Status step** (shown when already logged in):
- Shows role badge, name, verified email (lock icon if email-verified)
- "Switch Account" (hidden if email-verified)
- "Sign Out" → goodbye screen then logout
- "Sign out all devices" (shown when email-verified and other trusted devices exist)

### ForcedLogoutBanner
Fixed-position notification shown when another device triggered "Sign out all devices".

- Slide-up animation; auto-dismisses after 6 seconds; manual "OK" button
- Shows the user's name captured before state is cleared
- Rendered inside `AuthProvider` — always available on any page

### RichTextEditor
Contenteditable description field with a formatting toolbar.

- Toolbar: Bold, Italic, Underline, Bullet List
- Smart URL linkification on paste or type:

| Pasted URL pattern | Rendered label |
|---|---|
| `*.sharepoint.com/:b:/*` | SharePoint PDF (staff) |
| `docs.google.com/document/` | Google Doc |
| `docs.google.com/spreadsheets/` | Google Sheet |
| `youtube.com/watch` / `youtu.be/` | YouTube Video |
| `zoom.us/j/` | Zoom Meeting |
| `teams.microsoft.com/` | Microsoft Teams |
| Any other URL | Capitalised domain name |

### WeatherWidget
Live weather chip shown in the page header. Lazy-loaded — does not block page render.

- Requests geolocation; falls back to server `.env` coordinates
- Calls `GET /api/weather?lat=&lon=` — data cached server-side for 10 minutes
- Displays: WMO condition icon (emoji), temperature (°F), condition text, city name
- Hidden when `weatherEnabled` config flag is false

### VisitorCounter
Live badge showing how many browser sessions have the app open. Lazy-loaded — does not block page render.

- Generates a UUID session ID once per browser session
- Sends `POST /api/visitors/heartbeat` every 30 seconds
- Polls `GET /api/visitors` every 30 seconds for the live count
- Sessions older than 90 seconds excluded from the count
- Hidden when `visitorCounterEnabled` is false

### UserAvatar
Role-coloured avatar in the top-right corner of every page.

- Standard → blue person icon; Admin → gold crown; Superadmin → purple shield
- Clicking opens LoginModal (status step if logged in, PIN step if not)

### CrossDeviceVerifyModal
OTP flow for editing a booking from a device that doesn't own it.

- Prompts for the owner's `@briya.org` email
- Sends `POST /api/events/.../request-otp` → verifies via `POST /api/events/.../verify-otp`
- On success, receives a short-lived `editToken` used in the subsequent PUT/DELETE header

### RecurrenceActionSheet
Scope picker for recurring series edits/deletes. Bottom sheet on mobile.

- **This event** — affects only the clicked occurrence
- **This & following events** — from this recurrence index to end
- **All events** — every occurrence in the series

### SortModal
Drag-to-reorder UI for sites or rooms. Submits updated order to `PUT /api/sites/reorder` or `PUT /api/rooms/reorder/:siteCode`.

### ClearableInput
Text input with an inline ✕ clear button. Used in list view search and OTP step.

### PageTransition
Wraps each lazy page in a CSS entrance animation (`opacity` + `translateY`). Skipped when `prefers-reduced-motion` is set.

### ErrorBoundary
React class component catching render errors. Shows a fallback UI so the app never shows a blank screen.

---

## Authentication & Roles

### Roles and Capabilities

| Role | Avatar | Create bookings | Edit/delete own | Edit/delete any | Site/room mgmt | Admin dashboard | Excel export |
|---|---|---|---|---|---|---|---|
| none (guest) | — | No (if login required) | — | — | — | — | — |
| standard | Blue | Yes | Yes (future/active only) | No | No | No | No |
| admin | Gold | Yes | Yes | Yes | No | No | Yes |
| superadmin | Purple | Yes | Yes | Yes | Yes | Yes | Yes |

Standard users **cannot edit or delete past events** even when authenticated with OTP. Admins and superadmins have no such restriction.

### How Login Works

1. User enters PIN in LoginModal
2. `POST /api/auth/pin-verify` validates PIN and returns role
3. `POST /api/auth/validate-email` (Power Automate) checks email + returns display name
4. Device trusted check → OTP flow if not trusted
5. On success: `POST /api/auth/verify` issues JWT (24-hour expiry) stored in `localStorage`
6. Auth state `{ role, name, email, emailVerified, deviceSessionId }` stored in `localStorage` and React state
7. Device name stored in both `localStorage` and a 1-year cookie

### Per-Role Name Memory

| Role | localStorage key | Cookie name |
|---|---|---|
| standard | `briya_standard_name` | `briya_std_name` |
| admin | `briya_admin_name` | `briya_adm_name` |
| superadmin | `briya_superadmin_name` | `briya_sadm_name` |

---

## Email Verification & OTP Flow

### Why Email Verification Exists

Email verification links a booking to an identity (not just a device). Once verified:
- The user can edit their own bookings from **any device** (cross-device OTP)
- The session can be revoked via "Sign out all devices"
- The JWT contains `emailVerified: true` (set server-side — never self-asserted)

### OTP Login Flow (New Device)

```
User enters PIN + @briya.org email
        ↓
POST /api/auth/validate-email  (Power Automate — returns name if found)
        ↓
  Not in directory? → show banner (Try again / Skip)
  Found? ↓
POST /api/auth/check-trusted  (not rate-limited)
        ↓
  trusted = true?  →  fast login with PA name (skip OTP + name step)
  trusted = false? ↓
POST /api/auth/request-login-otp
  OTP session saved to sessionStorage (survives mobile browser reload)
        ↓
User enters code (retrieved from email app)
        ↓
POST /api/auth/verify-login-otp  →  { ok, emailClaimToken }
        ↓
  PA name available? → POST /api/auth/verify → auto-login (skip name step)
  No name? → name step → POST /api/auth/verify
        ↓
Device added to trusted_devices (90-day TTL)
```

### Admin / Superadmin: Email Is Mandatory

- PIN validates but no email provided → error: "Admin access requires a verified @briya.org email."
- "Skip email verification" hidden in OTP step
- "Continue without email" hidden on OTP send failure
- Trusted device fast-login still works once OTP was completed once on that device

### Trusted Device Logic

A device is trusted when:
- Its `email + deviceSessionId` pair exists in `trusted_devices` table
- The stored user-agent matches (hard check)
- The IP may differ (soft check — logs a warning but does not reject)
- The trust has not expired (default 90-day TTL)

---

## Session Management

### Session Revocation Poll

For email-verified sessions, `AuthContext` polls `GET /api/auth/session` every 30 seconds.

When 401 is received:
1. User's display name captured from `authRef.current` (stale-closure-safe)
2. `authToken` and `room_reservation_auth` removed from localStorage
3. React auth state reset to "none"
4. `ForcedLogoutBanner` shown for 6 seconds

### Token Expiry (401 from api.js)

When any API call returns 401 with a token present:
1. Removes tokens from localStorage
2. Dispatches `briya:auth:expired` custom event
3. `AuthContext` calls `logout()` silently (natural expiry, no banner)

### logout vs logoutAll

- **`logout()`** — local only; clears localStorage and React state
- **`logoutAll()`** — calls `POST /api/auth/logout-all` (stamps `last_logout_at`, deletes all trusted devices for that email), then calls `logout()`

---

## Configuration System

`ConfigContext` fetches `GET /api/config` on mount (30-second browser cache). The backend merges `.env` defaults with overrides in `config_overrides.json`.

### Toggleable Flags (via Admin Dashboard)

| Flag | Default | Description |
|---|---|---|
| `requireLoginForCalendar` | `true` | Gates the calendar behind a PIN prompt |
| `enableRecurringEvents` | `true` | Shows/hides the Recurring Event checkbox |
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
| `bookingStartHour` | Earliest bookable hour (e.g. `8` = 8 am) |
| `bookingEndHour` | Latest bookable hour (e.g. `21` = 9 pm) |
| `slotDurationMinutes` | Calendar time slot size (e.g. `15`) |
| `businessStart` / `businessEnd` | Business hours window |
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
- On 401 with a token: clears localStorage, dispatches `briya:auth:expired`
- On non-2xx: throws with the server's `error` message

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
| `getConfig()` | GET | `/config` |
| `updateConfig(data)` | PUT | `/config` |
| `getWeather(lat, lon)` | GET | `/weather` |
| `getVisitors()` | GET | `/visitors` |
| `heartbeatVisitor(sessionId)` | POST | `/visitors/heartbeat` |

---

## Contexts

### AuthContext (`src/context/AuthContext.jsx`)

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
- `validatePin(pin)` — PIN-only validation (returns role or null)
- `canDelete()` — returns true for admin and superadmin

**Side effects:**
- Listens for `briya:auth:expired` custom event → calls `logout()`
- Polls `GET /api/auth/session` every 30 s when `emailVerified` is true → shows `ForcedLogoutBanner` on 401
- Renders `<ForcedLogoutBanner>` inside the Provider

**Helper exports:**
- `getDeviceName(role)` — reads the stored display name for a role (localStorage → cookie fallback)

### ConfigContext (`src/context/ConfigContext.jsx`)

Fetches `GET /api/config` on mount and provides the merged config object. Falls back to `appConfig.js` defaults until the API responds or if it fails.

**Exposed values:**
- `config` — current config object (all flags and static values)
- `updateConfig(key, value)` — calls `PUT /api/config` and updates local state

---

## Responsiveness

All pages and components use plain CSS — no breakpoint framework.

### Breakpoints

| Breakpoint | Target |
|---|---|
| `max-width: 480px` | Phones (portrait) — bottom sheet modals |
| `min-width: 481px` and `max-width: 768px` | Phones (landscape) / small tablets |
| `min-width: 769px` and `max-width: 1024px` | Tablet landscape / small desktop |
| `min-width: 2560px` | 4K / large displays |

### Responsive Patterns

- **Card grids:** `repeat(auto-fit, minmax(260px, 1fr))` — 1 to 4+ columns
- **Bottom sheets:** modals use `position: fixed; bottom: 0` with slide-up animation on `≤ 480px`
- **Virtual keyboard avoidance:** `LoginModal` listens to `window.visualViewport` and adds `paddingBottom`
- **`clamp()` typography:** font sizes scale smoothly between breakpoints
- **`prefers-reduced-motion`:** all animations wrapped or overridden to remove motion

---

## Performance

### Bundle splitting

| Chunk | Contents | Loaded |
|---|---|---|
| `vendor-react` (162 KB raw / 53 KB gzip) | React, ReactDOM, React Router | Every page |
| `vendor-fullcalendar` (260 KB / 76 KB gzip) | FullCalendar + all plugins | CalendarPage only |
| `LoginModal` | Auth modal (OTP, trusted device, success screens) | Any page that opens it |
| `VisitorCounter` | Live visitor badge | Only when `visitorCounterEnabled` + page mounts |
| `WeatherWidget` | Weather chip | Only when `weatherEnabled` + page mounts |
| `HomePage` | Home page JS | First visit to `/` |
| `RoomsPage` | Rooms page JS | First visit to `/rooms/*` |
| `CalendarPage` | Calendar page JS | First visit to `/calendar/*` |
| `AdminPage` | Admin dashboard JS | First visit to `/admin` |

### Other optimisations

- **Pages:** `React.lazy` + `Suspense` — each page downloads only when first visited
- **Widgets:** `WeatherWidget` and `VisitorCounter` are `React.lazy` — page renders before their chunks arrive
- **Images:** first card image `loading="eager"`; all subsequent cards `loading="lazy"`
- **Fonts:** non-render-blocking (`rel="preload"` + `onload` swap trick); `display=swap` prevents invisible text
- **Preconnects:** `<link rel="preconnect">` for API host and Google Fonts in `index.html`
- **Backend gzip:** Express `compression()` middleware on all API responses
- **Config cache:** `GET /api/config` served with `Cache-Control: public, max-age=30`
- **Image cache:** `GET /images/*` served with `Cache-Control: max-age=7d` by nginx

---

## Local Development

**Prerequisites:** Node.js 20+, npm, backend running on `localhost:4000`.

```bash
cd "Room Reservation/frontend"
npm install
cp .env.example .env          # set VITE_API_BASE=http://localhost:4000/api
npm run dev                   # → http://localhost:5173
```

Or from the monorepo root (starts both together):
```bash
cd "Room Reservation"
npm install
npm run dev    # backend port 4000 + frontend port 5173
```

---

## Environment Variables

| Variable | Required | Description | Dev | Prod |
|---|---|---|---|---|
| `VITE_API_BASE` | Yes | Backend API base URL | `http://localhost:4000/api` | `https://briya-api.duckdns.org/api` |
| `VITE_BASE_PATH` | Prod only | GitHub Pages subpath | `/` | `/briya-room-reservation-v2/` |

`.env` is gitignored. `.env.production` is committed — public build-time values only, no secrets.

---

## Build & Deployment

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

---

## GitHub Actions CI/CD

Every `git push` to `main` triggers an automatic build and deployment.

**Workflow:** `.github/workflows/deploy.yml` (repo root — not inside `frontend/`)

```
push to main
  → npm ci  (in frontend/)
  → npm run build  (uses GitHub Actions secrets as env vars)
  → upload dist/ as Pages artifact
  → deploy to https://briyapcs.github.io/briya-room-reservation-v2/
```

**Required GitHub Actions Secrets** (Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `VITE_API_BASE` | `https://briya-api.duckdns.org/api` |
| `VITE_BASE_PATH` | `/briya-room-reservation-v2/` |

**GitHub Pages source** must be set to "GitHub Actions" in repo Settings → Pages.

Manual trigger: Actions → Deploy to GitHub Pages → Run workflow.

---

*Designed & Engineered by the Briya IT Team · © 2026 Briya Public Charter School*
