# Known Issues, Tech Debt & Follow-ups

A maintainer-facing list of things flagged during the build/handover review. None block normal operation, but they are worth addressing.

## Security / config
| Item | Detail | Suggested fix |
|---|---|---|
| Local-only secrets | `.env` is gitignored and **not** in git history (verified). The dev's local copy holds the keys/passwords, but they belong to the company's own accounts | No rotation needed — confirm company control and delete the dev's local copy at handover (see [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md)) |
| Dead `VITE_*_PASSWORD` vars | `VITE_DASHBOARD_PASSWORD`, `VITE_TECH_PASSWORD`, `VITE_ADMIN_PASSWORD` are not referenced anywhere in `src/`; auth is fully server-side | Delete from any `.env`; remove from docs |
| `VITE_VAPID_PUBLIC_KEY` easy to miss | Code reads it (`src/lib/push.js`); it was absent from the local `.env` sample | Ensure it is set in Vercel + local `.env` |
| Permissive ticket RLS | `tickets` allows public read/insert/update (no per-user DB identity) | Acceptable for the current shared-auth model; consider Supabase Auth + row ownership if tightening is required |
| Public storage bucket | `repair-photos` is public-read; URLs are unguessable but not access-controlled | Consider signed URLs if photos are sensitive |

## Auth model
| Item | Detail |
|---|---|
| Hybrid login | Admin uses a shared password (`verify-login` + `role_passwords`); Staff/Technician use individual accounts (`staff_accounts`/`technician_accounts` via `staff-login`/`tech-login`). `STAFF_PASSWORD`/`TECH_PASSWORD` secrets are effectively legacy fallbacks now that the UI routes those roles to per-account login |
| Stale code docstrings | `src/pages/LoginPage.jsx` header still says "There is no username — the password alone determines access," but Staff/Technician now require a username. Cosmetic; update when touched |
| Client-side session | "Session" is a JSON record in local/sessionStorage, not a server token. There is no server-side session invalidation; an expired persistent session only triggers local cleanup + push unsubscribe |

## Frontend
| Item | Detail |
|---|---|
| Inline nav styles | `DashboardLayout.jsx` has a `// REVIEW` note: sidebar nav repeats Tailwind utility strings that also exist as `.sidebar-nav-active` / `.sidebar-nav-inactive` in `index.css`. Consolidate to one source of truth |
| Dev service worker disabled | `vite.config.js` disables the PWA dev service worker (`devOptions.enabled: false`) because a stale SW was serving an old bundle in dev and masking backend errors as "Connection error." Production is unaffected. Re-enable only to test Web Push locally |

## Data integrity
| Item | Detail |
|---|---|
| Realtime fallback polling | If the Supabase realtime channel drops, pages fall back to polling (`TRACK_POLL_INTERVAL_MS` 30s, `DASHBOARD_POLL_INTERVAL_MS` 60s). Expected behavior, but updates can lag up to the interval |
| Status transitions enforced twice | UI rules (`useRole.jsx`) and a DB trigger (`enforce-status-transitions.sql`) must be kept in sync if the workflow changes |
| Schema source of truth | `sql/full-setup.sql` is the canonical schema. There is no migration tool — schema changes are applied by hand in the Supabase SQL Editor. Keep `full-setup.sql` updated when you change tables |

## Operational
| Item | Detail |
|---|---|
| No automated DB backups documented | Confirm Supabase project tier includes backups, or schedule them |
| DB flush is destructive | The "Flush Database" admin action (password-gated `admin-delete`) permanently deletes ticket data + storage. There is no in-app undo |
| Push is broadcast-only | `send-push` notifies **all** active subscriptions regardless of role; there is no per-user targeting |

## Suggested next enhancements
- Tighten RLS / move to Supabase Auth for true per-user identity
- Add automated DB backups + a documented restore drill
- Add per-role/targeted push instead of global broadcast
- Add a real migration workflow (Supabase CLI migrations) instead of hand-run SQL
- **Auto-record ticket attribution** — tickets currently store a manually-typed `technician_name` + `assigned_staff` (for commission); log the actual signed-in technician/staff account automatically as an audit trail
- Update the stale code docstrings noted above
