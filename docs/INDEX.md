# VRXE Repair Ticket System — Handover Documentation

This folder is the turnover package for the VRXE Repair Ticket System. It is organized by audience.

## For end users (shop staff using the app daily)
- [USER_GUIDE.md](USER_GUIDE.md) — how to use every part of the app, per role
- [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) — common problems and answers

## For the client / product owner
- [FINAL_AGREEMENT.md](FINAL_AGREEMENT.md) — final terms & conditions: handover + post-engagement support (sign this)
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — non-technical summary of what was built, limitations, next steps
- [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md) — accounts/credentials to transfer + security actions
- [LICENSES.md](LICENSES.md) — third-party software licenses used
- 🔐 **CREDENTIALS_HANDOVER.md** — all emails/accounts/passwords (gitignored, delivered securely — **not** in this repo or the PDF bundle)

## For developers / IT ops (hosting & maintaining the app)
- [README.md](../README.md) — technical README (setup, build, run)
- [ARCHITECTURE.md](ARCHITECTURE.md) — components, data flow, integrations
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — deploy, rollback, restart, monitor
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — tech debt and follow-ups
- Database schema → [`sql/full-setup.sql`](../sql/full-setup.sql) (single source of truth)
- Environment variables → [`env.example`](../env.example)

## Quick facts
| | |
|---|---|
| Product | VRXE Repair Ticket System (PWA) |
| Repository | https://github.com/vrxe0274/company-repair-ticket-system |
| Frontend host | Vercel |
| Backend | Supabase (Postgres + Edge Functions + Storage) |
| Support / dev contact | Neo Monserrat — neo.monserrat@gmail.com |

> ⚠️ **Before final handover, complete the actions in [OWNERSHIP_AND_SECURITY.md](OWNERSHIP_AND_SECURITY.md).** Rotate the Supabase keys and login passwords so the client alone controls them. (The `.env` file is correctly gitignored and is *not* in git history — this is handover hygiene, not a leak.)
