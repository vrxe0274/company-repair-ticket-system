# Handover Notes

**Project:** VRXE Repair Ticket System
**Repository:** https://github.com/vrxe0274/company-repair-ticket-system
**Built by:** Neo Monserrat — neo.monserrat@gmail.com

I built this app as an internship project for VRXE. It's finished and now belongs to VRXE outright. This note sums up what was handed over and how things stand going forward. Read it alongside the rest of the docs in [`docs/`](INDEX.md).

## What was built
The app is delivered as a finished product:
- The customer ticket-submission flow, public tracking, and the staff/technician/admin dashboard.
- The Supabase backend (database schema, Edge Functions, storage) and Vercel hosting setup.
- Full documentation (listed below).

A plain-language overview of what it does, plus known limitations, is in [`PROJECT_SUMMARY.md`](PROJECT_SUMMARY.md).

## Going forward
- VRXE owns and runs the app. It's built entirely on VRXE's own accounts, so there's nothing to transfer — the company already controls everything.
- I'm not maintaining the app going forward and won't be adding new features. It's built to be picked up by VRXE's future developers using the docs here.
- You can still reach me with questions at neo.monserrat@gmail.com, but day-to-day upkeep — hosting costs, account renewals, backups, and operation — is VRXE's to handle.

## Documentation handed over
| Doc | Where |
|---|---|
| Technical README (setup, build, run) | [`README.md`](../README.md) |
| Architecture overview (components, data flow) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Deployment runbook (deploy, rollback, monitor) | [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) |
| Database schema (single source of truth) | [`sql/full-setup.sql`](../sql/full-setup.sql) |
| Environment variables reference | [`env.example`](../env.example) |
| **Formulas** (commission, pricing, ticket IDs) | [`USER_GUIDE.md`](USER_GUIDE.md) & [`ARCHITECTURE.md`](ARCHITECTURE.md); code in `src/lib/commission.js`, `src/lib/quotation.js`, `src/lib/utils.js` |
| End-user guides (per role) | [`USER_GUIDE.md`](USER_GUIDE.md) |
| Troubleshooting & FAQ | [`TROUBLESHOOTING_FAQ.md`](TROUBLESHOOTING_FAQ.md) |
| Roles, access & security notes | [`ACCESS_AND_SECURITY.md`](ACCESS_AND_SECURITY.md) |
| Known issues / tech debt | [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) |
| Third-party license inventory | [`LICENSES.md`](LICENSES.md) |

Everything is version-controlled in the repo, so future maintainers can read it alongside the code.

## Accounts & credentials
All emails, accounts, and passwords used by the app (GitHub, Supabase, Vercel, domain, VAPID keys, and login passwords) are collected in one file:

> **`CREDENTIALS_HANDOVER.md`** — the single source for all account details.

It's kept out of the git repo (gitignored) and delivered separately through a secure channel (password manager or encrypted transfer). Everything lives on VRXE's own accounts, so nothing needs rotating.

---
*Part of the VRXE Repair Ticket System handover package. See [`INDEX.md`](INDEX.md) for the full document set.*
