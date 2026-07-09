# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server
npm run build         # Production build
npm run lint          # ESLint
npm run test          # Vitest, watch mode
npm run test:run      # Vitest, single run (CI)
npm run test:ui       # Vitest browser UI
```

Run a single test file: `npx vitest run src/__tests__/lib/commission.test.js`
Run tests matching a name: `npx vitest run -t "commission"`

Tests live in `src/__tests__/{hooks,lib,pages}`, mirroring the `src/` tree they cover. Setup file: `src/__tests__/setup.js`.

Edge Functions (`supabase/functions/`) are Deno/TypeScript and are excluded from the Node ESLint config (`eslint.config.js` ignores `supabase/`) — they're linted by Deno, not by `npm run lint`.

## Architecture

**Stack:** React 18 + Vite + Tailwind, React Router v6, Supabase (Postgres + RLS + Realtime + Storage), Supabase Edge Functions (Deno) for anything requiring a secret, Workbox-powered PWA with a custom service worker (`src/sw.js`) for Web Push.

### Auth is not Supabase Auth

There's no Supabase Auth / JWT. Three roles — **Admin** (one shared password), **Staff**, **Technician** (individual username+password accounts, created by Admin) — are verified server-side by dedicated Edge Functions so passwords never reach the browser bundle:

- `verify-login` — Admin shared password (hash in `role_passwords` table / Supabase secret)
- `staff-login` / `tech-login` — individual account login (`staff_accounts` / `technician_accounts` tables)
- `staff-manage` / `tech-manage` — Admin creates/resets accounts
- `change-password` — self-service password change
- `admin-delete` — password-gated destructive DB flush (reuses `ADMIN_PASSWORD`)

All Edge Functions deploy with `--no-verify-jwt` since auth is shared-password/per-account, not Supabase Auth JWTs. All passwords are PBKDF2-hashed.

Session state (role, username, name, expiry) lives in `src/lib/session.js` (localStorage for "Remember me"/PWA, sessionStorage otherwise) and is exposed via `useAuth.jsx` (session lifecycle) and `useRole.jsx` (role + permission predicates: `isAdmin`, `isStaff`, `isTechnician`, `isManager` = Staff-or-Admin). **Admin is a strict superset of Staff** for all queue/pricing permissions — `isManager` is the check used almost everywhere; Admin-only features check `isAdmin` directly.

### Status workflow — enforced twice

`Pending → Inspection & Quote → Repair in Progress → Done → Paid`, with `Pending → Denied` as a side branch. Legal transitions per role are defined in `ROLE_TRANSITIONS` in `useRole.jsx` (`getAllowedTransitions`) and re-enforced independently at the database level by a Postgres trigger (`sql/full-setup.sql`, see `enforce-status-transitions`). Never trust the frontend check alone when touching ticket status — the DB trigger is the actual source of truth and will reject invalid transitions even if the UI check is bypassed or wrong.

### Commission / payroll is manual, per-repair, no defaults

`src/lib/commission.js` is the single source of truth for commission math. After a ticket is marked `Paid`, Admin assigns `technician_usernames`/`assigned_staff` and manually types in that specific ticket's `tech_commission_pct`/`staff_commission_pct` — there is no default or fallback rate. A `null` pct means "not yet inputted," and every function (`technicianCommission`, `staffCommission`) propagates `null` rather than substituting a default; callers must handle the pending state explicitly (see `PayrollPage.jsx`'s `payeeStats`, which tracks `pending` counts separately from `amount`). Multiple technicians/staff can be assigned to one ticket — each earns the full percentage independently (not split). Staff commission is net-of-technician (`(fee - technicianCommission) * staffPct`), so it depends on both percentages being set.

### Data layer

Supabase JS client (`src/lib/supabase.js`) talks directly to Postgres tables (`tickets`, `notifications`, `push_subscriptions`, `app_settings`) under RLS, plus a `repair-photos` Storage bucket. Realtime subscriptions: `useLiveTickets.jsx` (ticket list) and `useNotifications.jsx` (notification feed). `sql/` contains the ordered, idempotent setup scripts — `full-setup.sql` is the main one (14 sections: tables, RLS, triggers, indexes, storage, realtime); `attendance-setup.sql` and `sessions-setup.sql` are separate add-on scripts, not part of `full-setup.sql`.

### Client-facing vs dashboard split

`src/pages/submit-ticket/` (multi-step public wizard) and `TrackTicketPage.jsx` (public tracking link, no login) are unauthenticated. Everything under `src/pages/dashboard/` requires a role and is gated by `ProtectedRoute.jsx`. `ticket-detail/` is its own multi-tab sub-app (Overview / Tech Notes / Pricing) with its own tabs/hooks/helpers subdirectory — read multiple files there together, not just the page component, to understand a change's full effect.

### PWA / push

Custom service worker at `src/sw.js` (not the Vite PWA plugin's generated one) so Web Push events can be handled; `vite.config.js` uses `injectManifest` strategy pointing at it. Dev SW is deliberately disabled (`devOptions.enabled: false` in `vite.config.js`) — a past stale precached SW in dev caused false "Connection error" symptoms unrelated to the backend. Only flip it on to test Web Push locally, and remember to flip it back. `send-push` (Edge Function, holds the VAPID private key) broadcasts to all `push_subscriptions` on new ticket submission and payment; `manage-push` handles subscription writes.
