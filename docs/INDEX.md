# VRXE Repair Ticket System — Handover Documentation

The docs for the VRXE Repair Ticket System, organized by who needs them.

## For end users (shop staff)
- [USER_GUIDE.md](USER_GUIDE.md) — how to use the app, per role
- [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) — common problems and fixes

## For the owner (VRXE)
- [FINAL_AGREEMENT.md](FINAL_AGREEMENT.md) — handover notes: what was handed over, how things stand
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — what was built, limitations, next steps
- [ACCESS_AND_SECURITY.md](ACCESS_AND_SECURITY.md) — roles & access + security notes
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

> The app was built entirely on the company's own accounts, so there's nothing to rotate or transfer at handover — VRXE already controls everything. The `.env` file is gitignored and not in git history.
