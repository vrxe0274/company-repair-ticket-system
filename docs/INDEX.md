# VRXE Repair Ticket System — Handover Documentation

The turnover package for the VRXE Repair Ticket System, organized by audience.

## For end users (shop staff)
- [USER_GUIDE.md](USER_GUIDE.md) — how to use the app, per role
- [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) — common problems and fixes

## For the client / owner
- [FINAL_AGREEMENT.md](FINAL_AGREEMENT.md) — handover terms & post-engagement support (sign this)
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — what was built, limitations, next steps
- [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md) — accounts to confirm + security notes
- [LICENSES.md](LICENSES.md) — third-party software licenses
- 🔐 **CREDENTIALS_HANDOVER.md** — all accounts/passwords (gitignored, delivered securely — not in this repo or the PDF bundle)

## For developers / IT ops
- [README.md](../README.md) — setup, build, run
- [ARCHITECTURE.md](ARCHITECTURE.md) — components, data flow, integrations
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — deploy, rollback, monitor
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — tech debt and follow-ups
- [`sql/full-setup.sql`](../sql/full-setup.sql) — database schema (source of truth)
- [`env.example`](../env.example) — environment variables

## Quick facts
| | |
|---|---|
| Product | VRXE Repair Ticket System (PWA) |
| Repository | https://github.com/vrxe0274/company-repair-ticket-system |
| Frontend host | Vercel |
| Backend | Supabase (Postgres + Edge Functions + Storage) |
| Support / dev contact | Neo Monserrat — neo.monserrat@gmail.com |

> The app was built entirely on the company's own accounts, so there are no developer-owned credentials to rotate at handover — the company already controls everything. Before final handover, confirm the ownership checklist in [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md). The `.env` file is gitignored and not in git history.
