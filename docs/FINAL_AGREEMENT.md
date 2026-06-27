# Final Terms & Conditions — Handover & Post-Engagement Agreement

**Project:** VRXE Repair Ticket System
**Repository:** https://github.com/vrxe0274/company-repair-ticket-system

| | |
|---|---|
| **Developer (outgoing)** | Neo Monserrat — neo.monserrat@gmail.com |
| **Client / Product Owner** | VRXE Repair Services _(authorized representative: ___________________________)_ |
| **Engagement** | Internship — application development |
| **Internship contract end date** | _____________________ |
| **Agreement effective date** | _____________________ |

This document sets out the terms under which the VRXE Repair Ticket System ("the App") is turned over to the Client, and the basis of any developer involvement after the internship contract ends. It is intended to be read alongside the rest of the handover package in [`docs/`](INDEX.md).

> This is a working agreement between the parties, not formal legal advice. Both parties may have it reviewed by counsel before signing.

---

## 1. Purpose
The Developer has completed the App and is handing it over to the Client as a finished product. This agreement confirms what has been delivered, what support remains available after the contract ends, and how the Developer's access to the App will be removed.

## 2. Scope of completed work
The App has been delivered as a finished product, including:
- The customer ticket-submission flow, public tracking, and the staff/technician/admin dashboard.
- The Supabase backend (database schema, Edge Functions, storage) and Vercel hosting configuration.
- Full handover documentation (see Section 4).

A non-technical summary of what was built, along with known limitations, is provided in [`PROJECT_SUMMARY.md`](PROJECT_SUMMARY.md).

## 3. Post-engagement support
After the internship contract end date stated above:

1. **Bug fixes — available.** The Developer remains available to assist with fixing **existing bugs / defects** in the App (functionality that was delivered but is not working as intended). Such work is arranged by consultation (see Section 6).
2. **New features — not included.** The Developer will **no longer add new features, modules, or enhancements** to the App after the contract has expired. New feature work, if ever needed, is outside the scope of this agreement and would require a separate, mutually agreed arrangement.
3. This distinction (fix vs. build) is intended to keep the App maintainable by the Client's future developers while still allowing the original author to help resolve genuine defects.

## 4. Documentation & knowledge transfer provided
To enable future developers and staff to operate and maintain the App without the original Developer, the following have been provided:

| Deliverable | Location |
|---|---|
| Technical README (setup, build, run) | [`README.md`](../README.md) |
| Architecture overview (components, data flow) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Deployment runbook (deploy, rollback, monitor) | [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) |
| Database schema (single source of truth) | [`sql/full-setup.sql`](../sql/full-setup.sql) |
| Environment variables reference | [`env.example`](../env.example) |
| **Formulas** (commission, pricing, ticket IDs) | Documented in [`USER_GUIDE.md`](USER_GUIDE.md) & [`ARCHITECTURE.md`](ARCHITECTURE.md); implemented in `src/lib/commission.js`, `src/lib/quotation.js`, `src/lib/utils.js` |
| End-user manuals (per role) | [`USER_GUIDE.md`](USER_GUIDE.md) |
| Troubleshooting & FAQ | [`TROUBLESHOOTING_FAQ.md`](TROUBLESHOOTING_FAQ.md) |
| Known issues / tech debt | [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) |
| Third-party license inventory | [`LICENSES.md`](LICENSES.md) |
| **Demo videos** explaining App features | _Provided separately — location: ____________________________ (e.g., shared drive / folder link)_ |

All guides, formulas, and manuals are version-controlled in the repository so future maintainers can read them alongside the code.

## 5. Turnover of accounts & credentials
All emails, accounts, and passwords used by the App (GitHub, Supabase, Vercel, domain, VAPID keys, login passwords, and the destructive-action password) are consolidated into a single handover file:

> **`CREDENTIALS_HANDOVER.md`** — the single source for all account/credential turnover.

For security, this file is **kept out of the git repository** (it is gitignored) and is delivered to the Client through a secure channel (e.g., a password manager or encrypted transfer). The ownership/transfer checklist and the surrounding security steps are documented in [`OWNERSHIP_AND_SECURITY.md`](OWNERSHIP_AND_SECURITY.md).

## 6. Removal of developer access & consultation for fixes
1. Upon completion of the turnover, the Developer will **remove all of their own access** to the App's systems — including the GitHub repository, Supabase project, Vercel project, and any related accounts — so that the Client has sole ownership and control.
2. As part of this, all shared passwords and keys the Developer knew are to be **rotated by the Client** (see [`OWNERSHIP_AND_SECURITY.md`](OWNERSHIP_AND_SECURITY.md), Security actions).
3. If a bug or fix needs to be addressed after access has been removed, the Client will **arrange a consultation** with the Developer. Access required to diagnose and fix the issue will be **granted temporarily by the Client for that purpose, and revoked afterward.**
4. Contact for consultation: **Neo Monserrat — neo.monserrat@gmail.com.**

## 7. Limitations
- The Developer's post-engagement assistance is limited to existing-bug fixes as described in Section 3 and is provided on a best-effort, by-consultation basis.
- The Client is responsible for the App's ongoing hosting costs, account renewals, data backups, and day-to-day operation after turnover.
- Known limitations of the App as delivered are listed in [`PROJECT_SUMMARY.md`](PROJECT_SUMMARY.md) and [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).

## 8. Acknowledgement & signatures
By signing below, both parties acknowledge that the App and its documentation have been turned over as described, and agree to the terms above.

| | Developer | Client / Authorized Representative |
|---|---|---|
| **Name** | Neo Monserrat | ____________________________ |
| **Signature** | ____________________________ | ____________________________ |
| **Date** | ____________________________ | ____________________________ |

---
*This agreement accompanies the VRXE Repair Ticket System handover package. See [`INDEX.md`](INDEX.md) for the full document set.*
