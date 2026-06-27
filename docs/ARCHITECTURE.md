# Architecture Overview

*Audience: developers / IT ops.* Companion to the root [README.md](../README.md) and [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

## High-level

```
                          ┌─────────────────────────────────────────────┐
                          │  Browser (React 18 PWA, served by Vercel)    │
                          │                                              │
   Public (no auth):      │  /submit   /track/:token   /login            │
   Protected (role):      │  /  /tickets  /tasks  /analytics  /payroll … │
                          │                                              │
                          │  Service Worker (src/sw.js):                 │
                          │   • precache app shell (offline)             │
                          │   • Supabase runtime caching                 │
                          │   • Web Push 'push' + 'notificationclick'    │
                          └───────────────┬──────────────────────────────┘
                                          │ supabase-js (anon key)
                  ┌───────────────────────┼─────────────────────────────┐
                  │                       │                             │
        Postgres + RLS + Realtime   Supabase Storage            Edge Functions (Deno)
        ┌───────────────────────┐   ┌──────────────┐    ┌──────────────────────────────┐
        │ tickets               │   │ repair-photos│    │ verify-login  staff-login    │
        │ notifications         │   │  (public)    │    │ tech-login    staff-manage   │
        │ app_settings          │   └──────────────┘    │ tech-manage   change-password│
        │ role_passwords        │                       │ admin-delete  send-push      │
        │ staff_accounts        │                       │ manage-push                  │
        │ technician_accounts   │                       │  (service-role key + Deno KV │
        │ push_subscriptions    │                       │   for rate limiting)         │
        └───────────────────────┘                       └──────────────────────────────┘
                                                                 │
                                                          Web Push (VAPID) → browsers
```

## Frontend
- **Stack:** React 18, Vite 7, React Router 6, Tailwind CSS 3.
- **Routing** ([src/App.jsx](../src/App.jsx)): public pages are eagerly loaded; the entire authenticated dashboard is **code-split** with `React.lazy` + `Suspense`, so the initial bundle stays small.
- **Auth guard:** `ProtectedRoute` wraps the dashboard; it also supports `requiredRole` (e.g. Admin-only `/accounts`, `/payroll`) and `blockedRole` (Admin blocked from `/earnings`).
- **State/context providers** (in `main.jsx`): `AuthProvider`, `RoleProvider`, `NotificationsProvider`, theme.
- **Key hooks:** `useAuth` (login/session), `useRole` (role + allowed status transitions), `useNotifications` (in-app feed + realtime), `useLiveTickets` (realtime tickets + polling fallback), `useTheme`.
- **PWA:** `vite-plugin-pwa` with `injectManifest` strategy and a **custom service worker** (`src/sw.js`) so Web Push events can be handled. Dev SW is disabled (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md)).

## Authentication model
There is **no Supabase Auth / JWT**. Instead:

| Role | Client call | Edge Function | Credential store |
|---|---|---|---|
| Admin | `loginWithRole` | `verify-login` | `ADMIN_PASSWORD` secret / `role_passwords` hash |
| Staff | `loginAsStaff` | `staff-login` | `staff_accounts` (per-user, PBKDF2) |
| Technician | `loginAsTechnician` | `tech-login` | `technician_accounts` (per-user, PBKDF2) |

- Passwords are **PBKDF2-SHA256** hashed (100k iterations, role/username-scoped salt) — see [`supabase/functions/_shared/auth.ts`](../supabase/functions/_shared/auth.ts).
- **Rate limiting** uses **Deno KV** (5 attempts / 15-min window / 15-min lockout) with timing-safe comparison.
- The browser-side **"session"** is a JSON record in local/sessionStorage (`src/lib/session.js`): `localStorage` + 30-day sliding expiry when "Remember me" or installed-PWA; `sessionStorage` otherwise. No server-side session token.

## Data flow examples
- **New ticket:** client inserts into `tickets` (RLS allows public insert) → DB trigger `fn_notify_on_ticket_insert` creates a Staff `notifications` row → Realtime pushes it to connected dashboards; (optionally) `send-push` broadcasts a Web Push.
- **Status change:** client updates `tickets.status` → DB trigger `enforce_status_transition` validates the move (rejects invalid ones) → trigger `fn_notify_on_ticket_status_change` inserts a role-targeted notification.
- **Quote/payment:** Staff edits pricing JSON (`labor_items`, `parts_items`, discounts) → totals computed → on Paid, `receipt_number` + `paid_at` are set.
- **Push subscription:** browser subscribes → `manage-push` (service role) writes to `push_subscriptions`; `send-push` reads active subs and delivers, pruning dead (404/410) endpoints.

## Database
Single source of truth: [`sql/full-setup.sql`](../sql/full-setup.sql) — 14 ordered, idempotent sections (tables, RLS, triggers, indexes, storage bucket, realtime publication).

Core tables: `tickets` (the central record), `notifications`, `app_settings` (key/JSONB store for Terms text + commission rate history), `role_passwords`, `staff_accounts`, `technician_accounts`, `push_subscriptions`. Storage bucket: `repair-photos` (public). Tickets and notifications are added to the `supabase_realtime` publication.

**RLS posture:** `tickets`, `notifications`, `app_settings` are intentionally permissive (public read/insert/update) because there's no per-user DB identity; **deletes** and **account/push tables** are locked to Edge Functions using the service-role key.

## Third-party integrations
| Service | Used for |
|---|---|
| **Supabase** | Postgres DB, Edge Functions (Deno), Storage, Realtime, Deno KV |
| **Vercel** | Static hosting + SPA routing (`vercel.json`) |
| **Web Push (VAPID)** | Device push notifications via `web-push` in `send-push` |
| **jsPDF / jspdf-autotable** | Quotation & receipt PDFs (client-side) |
| **ExcelJS** | `.xlsx` export |
| **date-fns**, **lucide-react** | Date formatting, icons |

## Key directories
```
src/pages/submit-ticket/      Customer 5-step wizard
src/pages/dashboard/          Authenticated app + ticket-detail/ subfolder
src/hooks/  src/lib/          Contexts/hooks and domain logic (auth, commission, pdf, push…)
supabase/functions/           9 Edge Functions + _shared/auth.ts
sql/full-setup.sql            Canonical DB schema
```
