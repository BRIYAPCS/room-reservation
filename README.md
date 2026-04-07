# Briya Room Reservation — Frontend

A React/Vite single-page application for booking conference rooms and shared spaces at **Briya Public Charter School**. Deployed to GitHub Pages and connected to a Node.js/Express REST API backend hosted on Linode.

**Live URL:** `https://briyapcs.github.io/room-reservation/`  
**Backend repo:** [BRIYAPCS/briya-api](https://github.com/BRIYAPCS/briya-api)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Pages & Components](#pages--components)
- [Authentication & Roles](#authentication--roles)
- [Configuration System](#configuration-system)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Build & Deployment](#build--deployment)
- [GitHub Actions CI/CD](#github-actions-cicd)

---

## Features

- **Multi-site, multi-room** booking system — navigate from school site → room → calendar
- **FullCalendar** week, month, and list views with drag-and-drop rescheduling
- **Recurring events** — Daily, Weekly (custom day picker), Bi-Weekly, Monthly with an "Ends On" date and live occurrence counter
- **Series position badge** — clicking any recurring event shows "🔁 3 / 10" (live, updates when occurrences are deleted)
- **Smart URL labels** in the description field — paste any link and it auto-renders a human-readable label (e.g. SharePoint PDF, YouTube Video, Zoom Meeting)
- **Event conflict detection** with orange highlight and ⚠ badge on overlapping bookings
- **Superadmin dashboard** at `/admin` — toggle features and booking rules for all users via iOS-style switches, backed by server-side persistence
- **Role-based permissions** — standard, admin, superadmin, each with different capabilities
- **Weather widget** and **visitor counter** (both toggleable from the admin dashboard)
- **Fully responsive** — mobile bottom sheets, icon-only headers on small screens, 2-column card grids on phones, 4K/large-screen support
- **Lazy-loaded pages** — each page is a separate JS chunk downloaded only when navigated to
- **Page transitions** and entrance animations (respects `prefers-reduced-motion`)
- **Excel export** (admin/superadmin) from the List view

---

## Tech Stack

| Layer | Library / Tool |
|---|---|
| Framework | React 18 + Vite 5 |
| Routing | React Router v6 |
| Calendar | FullCalendar v6 (daygrid, timegrid, interaction) |
| Styling | Plain CSS — CSS Grid, `clamp()`, media queries (no CSS framework) |
| HTTP | Native `fetch` via a thin `api.js` service layer |
| Auth | JWT stored in `localStorage`, decoded client-side |
| Build | Vite with esbuild minification, manual chunk splitting |
| Deploy | GitHub Pages via GitHub Actions |

---

## Project Structure

```
frontend/
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions — build & deploy to Pages on every push to main
├── public/
│   └── briya_logo.png            # Favicon / loading spinner
├── src/
│   ├── assets/
│   │   └── briya-logo-full.png   # Full horizontal logo used in page headers
│   ├── components/
│   │   ├── AddRoomModal          # Superadmin: create a new room
│   │   ├── AddSiteModal          # Superadmin: create a new site
│   │   ├── AttachmentSection     # File attachment UI inside event details
│   │   ├── BookingModal          # New event form (single-day, multi-day, recurring)
│   │   ├── Breadcrumb            # Site › Room breadcrumb shown in the calendar topbar
│   │   ├── BriyaFullLogo         # Full horizontal logo component
│   │   ├── BriyaLogo             # Square icon logo component
│   │   ├── EditBookingModal      # Edit an existing reservation
│   │   ├── EditCardModal         # Superadmin: rename a site or room card
│   │   ├── EventDetailsModal     # Read-only event popup with live series badge
│   │   ├── LoginModal            # PIN entry modal
│   │   ├── ManageActionSheet     # Mobile action sheet for site/room manage actions
│   │   ├── PageTransition        # Animated route transition wrapper
│   │   ├── PINModal              # PIN entry for superadmin escalation
│   │   ├── RecurrenceActionSheet # "Edit this / this & following / all" scope picker
│   │   ├── RichTextEditor        # Contenteditable description editor with smart URL linkifier
│   │   ├── SortModal             # Drag-to-reorder sites or rooms
│   │   ├── UserAvatar            # Role-coloured avatar icon shown in the top-right corner
│   │   ├── VisitorCounter        # Live active visitor count badge
│   │   └── WeatherWidget         # Live weather conditions chip in header
│   ├── config/
│   │   └── appConfig.js          # Default config values used before the API responds
│   ├── context/
│   │   ├── AuthContext.jsx       # JWT auth state, login/logout helpers, role access
│   │   └── ConfigContext.jsx     # App-wide config fetched from GET /api/config on startup
│   ├── pages/
│   │   ├── AdminPage             # Superadmin-only feature toggle dashboard
│   │   ├── CalendarPage          # Main booking calendar for a specific room
│   │   ├── HomePage              # Site grid — entry point of the app
│   │   └── RoomsPage             # Room grid for a selected site
│   ├── services/
│   │   └── api.js                # All fetch() calls to the backend REST API
│   ├── utils/
│   │   └── roles.js              # Role helper functions (isAdmin, isSuperAdmin, etc.)
│   ├── App.jsx                   # BrowserRouter shell with lazy-loaded page routes
│   ├── index.css                 # Global CSS reset and base font
│   └── main.jsx                  # React DOM entry point
├── .env.example                  # Template — copy to .env for local development
├── .env.production               # Production env vars (committed, contains no secrets)
├── index.html                    # HTML shell with meta tags and root mount point
└── vite.config.js                # Vite config — base path, dev proxy, chunk splitting
```

---

## Pages & Components

### HomePage (`/`)
Displays all school sites as image cards in a responsive auto-fit grid. Superadmins can enter Manage Mode to add, edit, delete, and drag-to-reorder sites. Manage Mode is gated by the `siteManagementEnabled` config flag.

### RoomsPage (`/rooms/:siteId`)
Displays all rooms for a selected site as image cards with capacity indicators. Superadmins can manage rooms when `roomManagementEnabled` is on. Clicking a room card navigates to its calendar.

### CalendarPage (`/calendar/:siteId/:roomId`)
The core reservation interface with three view modes:
- **Week view** (default) — time grid with drag-and-drop rescheduling and resize
- **Month view** — pill-style events with conflict indicators
- **List view** — sortable, filterable table with Excel export for admins

Includes: New Booking button, Refresh, date navigation, view switcher, user avatar, weather widget, and visitor counter.

### AdminPage (`/admin`)
Superadmin-only configuration dashboard. Non-superadmins are immediately redirected to `/`. Each toggle calls `PUT /api/config`, which writes to `config_overrides.json` on the server so changes apply to all users globally without a server restart.

---

### Key Components

#### BookingModal
New event form with a unified layout:
- **All Day** and **Recurring Event** checkboxes on the same row
- **Date grid** — Start Date always shown; End Date visible only when not recurring
- **Time grid** — Start/End time selectors, hidden when All Day is checked
- **Recurring sub-section** (when checked) — repeat type radios (Daily / Weekly / Bi-Weekly / Monthly), weekday picker for Weekly mode, Ends On date, live occurrence count

#### EventDetailsModal
Read-only event detail popup. Displays a `🔁 N / Total` series badge for recurring events. The badge is computed live from the loaded events state and updates automatically when any occurrence in the series is deleted.

#### RichTextEditor
Contenteditable rich-text description field supporting bold, italic, underline, and lists. Detects URLs as they are typed or pasted and converts them to human-readable links. Recognised services include:

| Pasted URL | Rendered label |
|---|---|
| `briya.sharepoint.com/:b:/s/staff/...` | SharePoint PDF (staff) |
| `docs.google.com/document/...` | Google Doc |
| `youtube.com/watch?v=...` | YouTube Video |
| `zoom.us/j/...` | Zoom Meeting |
| `teams.microsoft.com/...` | Microsoft Teams |
| Any other domain | Capitalised domain name |

---

## Authentication & Roles

Login uses PIN codes. A correct PIN returns a JWT that is stored in `localStorage` and decoded client-side to read the role.

| Role | Avatar | Capabilities |
|---|---|---|
| `none` | — | View calendar only (if "Require Login" is off) |
| `standard` | Blue icon | Book rooms, edit and delete own future events |
| `admin` | Gold crown | Everything standard + edit/delete any event + Excel export |
| `superadmin` | Purple shield | Everything admin + site/room management + `/admin` dashboard |

---

## Configuration System

On startup `ConfigContext` fetches `GET /api/config` and provides the result to every page and component via React context. The backend merges static `.env` values with any overrides saved in `config_overrides.json` by the admin dashboard.

Key toggleable flags:

| Flag | Default | Description |
|---|---|---|
| `enableRecurringEvents` | `true` | Shows or hides the Recurring Event checkbox |
| `requireLoginForCalendar` | `true` | Gates the calendar behind a PIN prompt |
| `allowDoubleBooking` | `true` | Allows or blocks overlapping reservations |
| `allowPastBookings` | `false` | Allows or blocks past-dated bookings |
| `allowWeekendBookings` | `false` | Allows or blocks Saturday/Sunday slots |
| `siteManagementEnabled` | `true` | Shows or hides superadmin site controls |
| `roomManagementEnabled` | `true` | Shows or hides superadmin room controls |
| `weatherEnabled` | `true` | Shows or hides the weather widget |
| `visitorCounterEnabled` | `true` | Shows or hides the visitor counter badge |

---

## Local Development

**Prerequisites:** Node.js 18+, npm, backend API running on `localhost:4000`.

```bash
# 1. Clone the repo
git clone https://github.com/BRIYAPCS/room-reservation.git
cd room-reservation

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Open .env and set:
#   VITE_API_BASE=http://localhost:4000/api

# 4. Start the dev server
#    /api requests are automatically proxied to localhost:4000
npm run dev
# → http://localhost:5173
```

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `VITE_API_BASE` | Yes | Backend API base URL | `http://localhost:4000/api` |
| `VITE_BASE_PATH` | Production only | GitHub Pages subpath | `/room-reservation/` |

`.env` is gitignored and never committed. `.env.production` is committed and contains only public, non-secret build-time values.

---

## Build & Deployment

```bash
# Create a production build
npm run build
# Output goes to: dist/

# Preview the production build locally before deploying
npm run preview
```

Vite splits the bundle into named chunks to reduce initial load time:

| Chunk | Contents |
|---|---|
| `vendor-react` | React, ReactDOM, React Router |
| `vendor-fullcalendar` | All FullCalendar plugins |
| Per-page chunks | Each page is lazy-loaded on first navigation |

---

## GitHub Actions CI/CD

Every push to `main` triggers an automatic deployment:

```
push to main
  → npm ci
  → npm run build        (uses .env.production values)
  → upload dist/ artifact
  → deploy to GitHub Pages
```

The workflow can also be triggered manually from the **Actions** tab in GitHub.

Workflow file: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

---

*Designed & Engineered by the Briya IT Team · © 2025 Briya Public Charter School*
