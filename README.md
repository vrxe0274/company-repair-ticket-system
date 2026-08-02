# VRXE Repair Ticket System

![CI](https://github.com/vrxe0274/company-repair-ticket-system/actions/workflows/ci.yml/badge.svg)

A full-stack repair ticket management system built for **VRXE Repair Services**. Handles the full lifecycle of a repair job — from client submission through technician diagnosis, pricing, and payment — with a staff dashboard, real-time updates, and web push notifications.

**Live demo:** *(add your Vercel URL here)*

---

## Features

### Client-facing (no login required)
- **Ticket submission** — 5-step wizard: terms & conditions acceptance → your info → your unit → issue description → appointment scheduling
- **Auto-generated Ticket ID** — sequential per month (`VR-2606-001`, `VR-2606-002`, …)
- **Public tracking page** — clients track status, view diagnosis notes, repair photos, pricing breakdown, and download their receipt PDF — all via a private tracking link
- **Payment proof upload** — clients can upload proof of payment directly from the tracking page

### Staff dashboard
- **Role-based access** — three roles: **Admin** (account management, Terms, payroll/analytics, plus all Staff powers), **Staff** (ticket queue, quoting, payment), and **Technician** (diagnosis, repairs, notes/photos). Login is a two-step flow: pick a role, then authenticate. **Admin** uses a single shared password; **Staff** and **Technician** each sign in with an individual **username + password** account created by the Admin. Each role has its own permissions and allowed status transitions
- **Server-side auth** — credentials are verified by Edge Functions and never ship to the browser bundle. Admin → `verify-login` (shared password, hash in the `role_passwords` table / Supabase secret); Staff → `staff-login` (`staff_accounts` table); Technician → `tech-login` (`technician_accounts` table). All passwords are PBKDF2-hashed. Admins create/reset accounts via `staff-manage` / `tech-manage`; users self-update via `change-password`
- **Persistent sessions** — "Remember me" keeps staff signed in for 30 days (sliding expiry); installed PWA auto-persists
- **Dashboard overview** — stat cards per status, visual status breakdown bar, live recent activity feed
- **Ticket list** — search, filter by status, sortable columns
- **Ticket detail — multi-tab view:**
  - *Overview* — client info, unit info, issue description, status management with undo
  - *Tech Notes* — diagnosis and repair notes (role-gated), repair photo uploads
  - *Pricing* — itemized labor and parts line items, discount, computed totals
- **Status workflow** — enforced at both the UI and database level (PostgreSQL trigger); invalid transitions are rejected server-side
- **Undo last status** — Staff/Admin can revert the most recent status change
- **PDF generation** — downloadable quotation and receipt PDFs
- **Excel export** — styled `.xlsx` report with date-range filename logic
- **Tasks page** — technician task view
- **Notifications page** — in-app notification feed with real-time updates
- **Settings** — light/dark theme toggle, Admin-only Terms & Conditions editor, and a Staff/Admin database flush

### Admin-only tools
- **Accounts** — create, rename, reset-password, and delete individual Staff and Technician accounts
- **Analytics** — ticket volume and status/revenue breakdowns
- **Commission** — payroll across both pay branches, reported as three separate columns per employee: **Commission Pay** (technician earns a % of labor; staff earns a % of the remainder), **Regular Pay** (daily rate, docked per late/undertime minute against the 10 AM–7 PM shift), and **Total Pay**. Click a payee for a popup listing every job they're on with that repair's rate and cut, **All Jobs** for every job broken down per employee, or **Daily Rates** to set each employee's daily rate. **Export** prompts for a month, then downloads a 3-sheet `.xlsx` — Payroll totals, per-job commission breakdown, and per-day regular pay
- **Earnings** — per-user commission view for Staff/Technician (Admin is blocked from this page)
- **Commissions** — configurable technician/staff rates with effective-dated history, applied per the rate active when each ticket was created

### PWA & Push
- **Installable PWA** — works offline, installable on desktop and mobile via browser prompt
- **Web Push notifications** — VAPID-based, broadcasts to all subscribed devices on new ticket submission and payment; iOS 16.4+ supported when installed to Home Screen
- **Service worker** — Workbox-powered offline caching

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6 |
| Database | Supabase (PostgreSQL + Row Level Security + Realtime) |
| Backend logic | Supabase Edge Functions (Deno/TypeScript) |
| File storage | Supabase Storage |
| Push notifications | Web Push API (VAPID), Workbox service worker |
| PWA | vite-plugin-pwa, Workbox |
| PDF | jsPDF, jspdf-autotable |
| Excel | ExcelJS |
| Icons | Lucide React |
| Hosting | Vercel |
| Tests | Vitest, Testing Library |

---

## Architecture Overview

```
Browser (React PWA)
  │
  ├── Supabase JS client
  │     ├── tickets table  (CRUD + RLS)
  │     ├── notifications table  (realtime channel)
  │     ├── push_subscriptions table
  │     ├── app_settings table  (editable T&C)
  │     └── Storage bucket  (repair-photos)
  │
  └── Supabase Edge Functions (Deno)
        ├── verify-login   — per-role password check (secrets never reach browser)
        ├── send-push      — VAPID push broadcaster (holds private key)
        └── admin-delete   — password-gated destructive DB operation

Service Worker (Workbox)
  ├── Offline asset caching
  └── Push event handler → showNotification()
```

---

## Project Structure

```
├── src/
│   ├── components/ui/
│   │   ├── ErrorBoundary.jsx
│   │   ├── Logo.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── PushPermissionPrompt.jsx
│   │   └── StatusBadge.jsx
│   ├── hooks/
│   │   ├── useAuth.jsx          # Auth context + session management
│   │   ├── useLiveTickets.jsx   # Supabase Realtime subscription
│   │   ├── useNotifications.jsx # In-app notification feed
│   │   ├── useRole.jsx          # Role + allowed status transitions
│   │   └── useTheme.jsx         # Dark/light theme
│   ├── lib/
│   │   ├── adminDelete.js       # Admin flush via Edge Function
│   │   ├── changePassword.js    # Self-service password change
│   │   ├── commission.js        # Technician/staff commission math (pay branch 1)
│   │   ├── salary.js            # Daily-rate regular salary math (pay branch 2)
│   │   ├── commissionExport.js  # Monthly payroll XLSX (3 sheets)
│   │   ├── constants.js         # Diagnosis fee, polling intervals
│   │   ├── errors.js            # Error helpers (softFail, etc.)
│   │   ├── export.js            # ExcelJS XLSX export
│   │   ├── notifications.js     # Notification helpers
│   │   ├── pdf.js               # jsPDF quotation PDF
│   │   ├── push.js              # VAPID subscribe/unsubscribe/send
│   │   ├── quotation.js         # Quotation computation
│   │   ├── receipt.js           # jsPDF receipt PDF
│   │   ├── session.js           # localStorage/sessionStorage session
│   │   ├── supabase.js          # Supabase client + Edge Function error helper
│   │   ├── terms.js             # T&C read/write via app_settings
│   │   └── utils.js             # Ticket ID, tracking token, status constants
│   ├── pages/
│   │   ├── dashboard/
│   │   │   ├── ticket-detail/   # Multi-tab ticket editor (tabs, hooks, helpers)
│   │   │   ├── AccountsPage.jsx      # Admin: manage staff/tech accounts
│   │   │   ├── AnalyticsPage.jsx     # Admin: ticket/revenue analytics
│   │   │   ├── EarningsPage.jsx      # Staff/Tech: own commission
│   │   │   ├── CommissionPage.jsx    # Admin: commission payroll
│   │   │   ├── DashboardHome.jsx
│   │   │   ├── DashboardLayout.jsx
│   │   │   ├── NotificationsPage.jsx
│   │   │   ├── SettingsPage.jsx
│   │   │   ├── TasksPage.jsx
│   │   │   ├── TicketDetailPage.jsx
│   │   │   └── TicketListPage.jsx
│   │   ├── submit-ticket/       # Multi-step form (steps, components, constants)
│   │   ├── LoginPage.jsx
│   │   ├── SubmitTicketPage.jsx
│   │   └── TrackTicketPage.jsx
│   ├── __tests__/               # Vitest unit tests
│   ├── App.jsx
│   ├── index.css                # Tailwind + design tokens
│   ├── main.jsx
│   └── sw.js                    # Workbox service worker
├── sql/                         # Supabase SQL setup scripts (run in order)
├── supabase/functions/          # Edge Functions (TypeScript/Deno)
├── public/                      # PWA icons
├── env.example
├── manifest.json
├── vercel.json
└── vite.config.js
```

---

## Setup

### Prerequisites

- Node.js v18+
- A [Supabase](https://supabase.com) account (free tier is enough)
- A [Vercel](https://vercel.com) account (for deployment)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a new Supabase project
2. In **SQL Editor**, run [`sql/full-setup.sql`](sql/full-setup.sql) once. It is a single, ordered, idempotent script that creates every table, RLS policy, trigger, index, storage bucket, and realtime publication (14 sections — see the header comment for the breakdown). For an existing database, run only the sections you are missing.
3. Go to **Project Settings → API** and copy your Project URL and anon key

### 3. Configure environment variables

```bash
cp env.example .env
```

Fill in `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

VITE_APP_URL=http://localhost:5173

VITE_VAPID_PUBLIC_KEY=B...your-vapid-public-key...
```

Login passwords are set as Supabase secrets (step 4), not `VITE_*` vars.

### 4. Deploy Edge Functions

```bash
supabase login
supabase link --project-ref your-project-id

# Deploy all Edge Functions (all use --no-verify-jwt — the app uses shared-password
# / per-account auth, not Supabase Auth JWTs):
supabase functions deploy verify-login    --no-verify-jwt   # Admin shared-password login
supabase functions deploy staff-login     --no-verify-jwt   # Staff account login
supabase functions deploy tech-login      --no-verify-jwt   # Technician account login
supabase functions deploy staff-manage    --no-verify-jwt   # Admin: create/reset staff accounts
supabase functions deploy tech-manage     --no-verify-jwt   # Admin: create/reset technician accounts
supabase functions deploy change-password --no-verify-jwt   # Self-service password change
supabase functions deploy admin-delete    --no-verify-jwt   # Password-gated DB flush
supabase functions deploy send-push       --no-verify-jwt   # VAPID push broadcaster
supabase functions deploy manage-push     --no-verify-jwt   # Push subscription writes

# Login passwords for the shared-password roles (verified server-side by verify-login):
supabase secrets set ADMIN_PASSWORD=your-admin-password
supabase secrets set STAFF_PASSWORD=your-staff-password
supabase secrets set TECH_PASSWORD=your-technician-password

# admin-delete reuses ADMIN_PASSWORD — no separate flush password.
supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```

Generate VAPID keys if you don't have them:
```bash
npx web-push generate-vapid-keys
```

### 5. Run locally

```bash
npm run dev
```

| Route | Description |
|---|---|
| `/submit` | Client ticket submission form (public) |
| `/track/:token` | Public ticket tracker (public) |
| `/login` | Staff / technician login (public) |
| `/` | Staff dashboard — Overview (auth required) |
| `/tickets`, `/tickets/:id` | Ticket list & detail |
| `/tasks`, `/notifications`, `/settings` | Tasks, notifications, settings |
| `/analytics`, `/commission`, `/accounts` | Admin-only (`/payroll` redirects to `/commission`) |
| `/earnings` | Staff / Technician only |

### 6. Deploy to Vercel

Push to GitHub, import the repo on Vercel, and add all `VITE_*` variables under **Settings → Environment Variables**. After the first deploy, update `VITE_APP_URL` to your real Vercel URL and redeploy.

---

## Environment Variables Reference

| Variable | Where to set | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` + Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` + Vercel | Supabase anon/public key |
| `VITE_APP_URL` | `.env` + Vercel | Full app URL (no trailing slash) |
| `VITE_VAPID_PUBLIC_KEY` | `.env` + Vercel | VAPID public key (safe for browser) |
| `ADMIN_PASSWORD` | Supabase secret | Admin role login password (verified by `verify-login`; also gates `admin-delete`) |
| `STAFF_PASSWORD` | Supabase secret | Staff role login password (verified by `verify-login`) |
| `TECH_PASSWORD` | Supabase secret | Technician role login password (verified by `verify-login`) |
| `VAPID_PUBLIC_KEY` | Supabase secret | Used by `send-push` Edge Function |
| `VAPID_PRIVATE_KEY` | Supabase secret | Never exposed to the browser |
| `VAPID_SUBJECT` | Supabase secret | `mailto:` contact for push service |

> Login passwords are Supabase secrets, never `VITE_*` vars — `verify-login` checks them server-side, so they never reach the browser bundle.

---

## Running Tests

```bash
npm run test        # watch mode
npm run test:run    # single run
npm run test:ui     # browser UI
```

---

## Status Workflow

```
Pending ──────────────────────────────────► Denied
   │
   ▼
Inspection & Quote
   │
   ▼
Repair in Progress
   │
   ▼
Done
   │
   ▼
Paid
```

Transitions are enforced both in the UI (per-role rules in `useRole.jsx`) and at the database level via a PostgreSQL trigger (`enforce-status-transitions.sql`). Invalid transitions are rejected even if someone bypasses the frontend.

---

## License

© VRXE Repair Services. All rights reserved.
